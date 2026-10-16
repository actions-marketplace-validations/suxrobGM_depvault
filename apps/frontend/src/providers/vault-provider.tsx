"use client";

import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import type { VaultInfo } from "@depvault/crypto";
import { useAuth } from "@/auth/use-auth";
import { useIdleLock } from "@/hooks/use-idle-lock";
import { REMEMBER_DEVICE_MS } from "@/lib/constants";
import {
  changeVaultPasswordOps,
  createProjectECDHGrant,
  createProjectRecoveryGrant,
  createProjectSelfGrant,
  createVault,
  fetchVaultInfo,
  recoverVaultOps,
  regenerateRecoveryKeyOps,
  resolveProjectDEK,
  unlockVaultKeys,
  VaultReauthRequiredError,
} from "@/lib/crypto";
import {
  clearVaultSession,
  loadVaultSession,
  saveVaultSession,
} from "@/lib/storage/vault-session-store";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

type VaultStatus = "loading" | "no-vault" | "locked" | "unlocked";

/**
 * Unlocked key material, held in a single ref (never state) so lock/logout/restore is one
 * assignment. `recoveryKey` is null after a session restore because it is never persisted.
 * `VaultInfo` lives apart since it survives a lock and is only cleared on logout.
 */
interface VaultSession {
  kek: CryptoKey;
  privateKey: CryptoKey;
  recoveryKey: CryptoKey | null;
  dekCache: Map<string, CryptoKey>;
}

/** Client-side vault state and cryptographic operations for end-to-end encryption. */
export interface VaultContextValue {
  isVaultSetup: boolean;
  isVaultUnlocked: boolean;
  vaultStatus: VaultStatus;
  /**
   * Derive the KEK, unwrap the private key, and unlock. `keepUnlocked` persists the session on
   * this device for 7 days so a refresh doesn't require the password again.
   */
  unlockVault: (password: string, keepUnlocked?: boolean) => Promise<void>;
  /** Clear all in-memory keys and revert to locked state. */
  lockVault: () => void;
  /** Create a new vault with keypair, KEK, and recovery key. Does not transition to unlocked. */
  setupVault: (password: string) => Promise<{ recoveryKey: string }>;
  /** Transition vault to unlocked after setup is complete (recovery key has been saved). */
  activateVault: () => void;
  /** Retrieve (and cache) the project's data encryption key via the user's key grant. */
  getProjectDEK: (projectId: string) => Promise<CryptoKey>;
  /** Generate a DEK for a new project and create SELF + RECOVERY key grants. */
  initializeProjectKeys: (projectId: string) => Promise<void>;
  /** Wrap the project DEK with an ECDH shared key and create a grant for a team member. */
  grantProjectKeyToMember: (
    projectId: string,
    recipientUserId: string,
    recipientPublicKey: string,
  ) => Promise<void>;
  /** Re-wrap the private key and all cached DEKs with a new KEK derived from the new password. */
  changeVaultPassword: (oldPassword: string, newPassword: string) => Promise<void>;
  /** Restore vault access using a recovery key and set a new password. */
  recoverVault: (recoveryKey: string, newPassword: string, keepUnlocked?: boolean) => Promise<void>;
  /** Generate a new recovery key and re-wrap all RECOVERY grants. */
  regenerateRecoveryKey: () => Promise<{ recoveryKey: string }>;
}

export const VaultContext = createContext<VaultContextValue | null>(null);

/** Manages vault lifecycle, in-memory keys, and idle-timeout auto-lock. */
export function VaultProvider(props: PropsWithChildren): ReactElement {
  const { children } = props;
  const { user } = useAuth();

  const [vaultStatus, setVaultStatus] = useState<VaultStatus>(user ? "loading" : "no-vault");
  const sessionRef = useRef<VaultSession | null>(null);
  const vaultInfoRef = useRef<VaultInfo | null>(null);

  /** Persist the unlocked session (KEK + private key only) to this device when the user opts in. */
  async function persistSession(keepUnlocked: boolean): Promise<void> {
    const session = sessionRef.current;
    if (!keepUnlocked || !user || !session || !vaultInfoRef.current) return;
    await saveVaultSession({
      userId: user.id,
      kek: session.kek,
      privateKey: session.privateKey,
      vaultInfo: vaultInfoRef.current,
      expiresAt: Date.now() + REMEMBER_DEVICE_MS,
    });
  }

  /** Rehydrate a remembered session; `recoveryKey` stays null until the password is re-entered. */
  async function tryRestoreSession(userId: string, info: VaultInfo): Promise<boolean> {
    const record = await loadVaultSession(userId);
    if (!record) return false;
    // Reject a KEK persisted before a password rotation on another device (the salt changed).
    if (record.vaultInfo.kekSalt !== info.kekSalt) {
      void clearVaultSession();
      return false;
    }
    sessionRef.current = {
      kek: record.kek,
      privateKey: record.privateKey,
      recoveryKey: null,
      dekCache: new Map(),
    };
    return true;
  }

  useEffect(() => {
    if (!user) {
      // Drop all key material and the persisted session so nothing carries over to the next
      // account on a shared browser. Refs only; no setState in the effect body.
      sessionRef.current = null;
      vaultInfoRef.current = null;
      void clearVaultSession();
      return;
    }

    let cancelled = false;

    fetchVaultInfo()
      .then(async (info) => {
        if (cancelled) return;
        if (!info) {
          setVaultStatus("no-vault");
          return;
        }
        vaultInfoRef.current = info;
        const restored = await tryRestoreSession(user.id, info);
        if (cancelled) return;
        setVaultStatus(restored ? "unlocked" : "locked");
      })
      .catch(() => {
        if (!cancelled) setVaultStatus("no-vault");
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const lockVault = () => {
    sessionRef.current = null;
    void clearVaultSession();
    setVaultStatus("locked");
  };

  useIdleLock(vaultStatus === "unlocked", IDLE_TIMEOUT_MS, lockVault);

  const unlockVault = async (password: string, keepUnlocked = false) => {
    // Re-fetch so a password rotated on another device (new KEK salt) isn't derived against a
    // stale cached salt.
    const info = (await fetchVaultInfo()) ?? vaultInfoRef.current;
    if (!info) throw new Error("Vault info not loaded");
    vaultInfoRef.current = info;

    try {
      const keys = await unlockVaultKeys(password, info);
      sessionRef.current = {
        kek: keys.kek,
        privateKey: keys.privateKey,
        recoveryKey: keys.recoveryKey,
        dekCache: new Map(),
      };
      setVaultStatus("unlocked");
    } catch (err) {
      // Never leave a stale session (and its DEK cache) behind a failed unlock.
      sessionRef.current = null;
      throw err;
    }

    // Best-effort: saveVaultSession swallows storage failures so they can't break the unlock.
    await persistSession(keepUnlocked);
  };

  const setupVault = async (password: string) => {
    const result = await createVault(password);
    sessionRef.current = {
      kek: result.keys.kek,
      privateKey: result.keys.privateKey,
      recoveryKey: result.keys.recoveryKey,
      dekCache: new Map(),
    };
    vaultInfoRef.current = result.vaultInfo;
    return { recoveryKey: result.recoveryKey };
  };

  const activateVault = () => {
    setVaultStatus("unlocked");
  };

  const getProjectDEK = async (projectId: string): Promise<CryptoKey> => {
    const session = sessionRef.current;
    if (!session) throw new Error("Vault is locked");

    const cached = session.dekCache.get(projectId);
    if (cached) return cached;

    const dek = await resolveProjectDEK(projectId, session.kek, session.privateKey);
    session.dekCache.set(projectId, dek);
    return dek;
  };

  const initializeProjectKeys = async (projectId: string) => {
    const session = sessionRef.current;
    if (!session) throw new Error("Vault must be unlocked to initialize project keys");
    // Creating the RECOVERY grant needs the recovery key, which a restored session omits.
    if (!session.recoveryKey) throw new VaultReauthRequiredError();

    const dek = await createProjectSelfGrant(projectId, user!.id, session.kek);
    await createProjectRecoveryGrant(projectId, user!.id, dek, session.recoveryKey);
    session.dekCache.set(projectId, dek);
  };

  const grantProjectKeyToMember = async (
    projectId: string,
    recipientUserId: string,
    recipientPublicKey: string,
  ) => {
    const session = sessionRef.current;
    if (!session) throw new Error("Vault must be unlocked to grant keys");
    if (!vaultInfoRef.current) throw new Error("Vault info not loaded");

    const dek = await getProjectDEK(projectId);
    await createProjectECDHGrant(
      projectId,
      recipientUserId,
      recipientPublicKey,
      dek,
      session.privateKey,
      vaultInfoRef.current.publicKey,
    );
  };

  const changeVaultPassword = async (_oldPassword: string, newPassword: string) => {
    const session = sessionRef.current;
    if (!session) throw new Error("Vault must be unlocked to change password");
    if (!vaultInfoRef.current) throw new Error("Vault info not loaded");

    const result = await changeVaultPasswordOps(
      newPassword,
      session.kek,
      vaultInfoRef.current,
      session.dekCache,
    );

    session.kek = result.kek;
    vaultInfoRef.current = result.vaultInfo;
    // The persisted KEK belongs to the old password; drop it so the next refresh re-unlocks.
    void clearVaultSession();
  };

  const recoverVault = async (recoveryKey: string, newPassword: string, keepUnlocked = false) => {
    const result = await recoverVaultOps(recoveryKey, newPassword);
    sessionRef.current = {
      kek: result.keys.kek,
      privateKey: result.keys.privateKey,
      recoveryKey: result.keys.recoveryKey,
      dekCache: new Map(),
    };
    vaultInfoRef.current = result.vaultInfo;
    setVaultStatus("unlocked");
    await persistSession(keepUnlocked);
  };

  const regenerateRecoveryKey = async (): Promise<{ recoveryKey: string }> => {
    const session = sessionRef.current;
    if (!session) throw new Error("Vault must be unlocked to regenerate recovery key");
    // Re-wrapping RECOVERY grants needs the old recovery key, which a restored session lacks.
    if (!session.recoveryKey) throw new VaultReauthRequiredError();

    const result = await regenerateRecoveryKeyOps(
      session.kek,
      session.recoveryKey,
      session.dekCache,
    );

    session.recoveryKey = result.recoveryKeyCryptoKey;
    return { recoveryKey: result.recoveryKey };
  };

  const value: VaultContextValue = {
    isVaultSetup: vaultStatus !== "no-vault" && vaultStatus !== "loading",
    isVaultUnlocked: vaultStatus === "unlocked",
    vaultStatus,
    unlockVault,
    lockVault,
    setupVault,
    activateVault,
    getProjectDEK,
    initializeProjectKeys,
    grantProjectKeyToMember,
    changeVaultPassword,
    recoverVault,
    regenerateRecoveryKey,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
