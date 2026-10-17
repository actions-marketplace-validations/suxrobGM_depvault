"use client";

import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import type { VaultInfo, VaultKeys } from "@depvault/crypto";
import { useAuth } from "@/auth/use-auth";
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
  unwrapRecoveryKey,
} from "@/lib/crypto";
import {
  clearVaultSession,
  loadVaultSession,
  saveVaultSession,
} from "@/lib/storage/vault-session-store";

type VaultStatus = "loading" | "no-vault" | "locked" | "unlocked";

/**
 * Unlocked key material, held in a single ref (never state) so lock/logout/restore is one
 * assignment. `VaultInfo` lives apart since it survives a lock and is only cleared on logout.
 */
interface VaultSession {
  kek: CryptoKey;
  privateKey: CryptoKey;
  recoveryKey: CryptoKey;
  dekCache: Map<string, CryptoKey>;
  /** Epoch ms the remembered device session expires, or null when it lives in memory only. */
  rememberedUntil: number | null;
}

interface RecoveryKeyResult {
  /** Formatted recovery key, shown to the user exactly once. */
  recoveryKey: string;
}

/** Client-side vault state and cryptographic operations for end-to-end encryption. */
export interface VaultContextValue {
  isVaultSetup: boolean;
  isVaultUnlocked: boolean;
  vaultStatus: VaultStatus;
  /** Whether the user already chose to reveal file contents during this unlocked session. */
  contentRevealed: boolean;
  /** Reveal file contents for the rest of this unlocked session. */
  revealContent: () => void;
  /**
   * Derive the KEK, unwrap the private key, and unlock. `remember` keeps the session on this
   * device for 30 days so a refresh doesn't require the password again.
   */
  unlockVault: (password: string, remember: boolean) => Promise<void>;
  /** Clear all in-memory keys and the remembered device session, and revert to locked. */
  lockVault: () => void;
  /** Create a new vault with keypair, KEK, and recovery key. Does not transition to unlocked. */
  setupVault: (password: string) => Promise<RecoveryKeyResult>;
  /** Transition vault to unlocked after setup is complete (recovery key has been saved). */
  activateVault: (remember: boolean) => Promise<void>;
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
  recoverVault: (recoveryKey: string, newPassword: string, remember: boolean) => Promise<void>;
  /** Generate a new recovery key and re-wrap all RECOVERY grants. */
  regenerateRecoveryKey: () => Promise<RecoveryKeyResult>;
}

export const VaultContext = createContext<VaultContextValue | null>(null);

/** Manages the vault lifecycle, in-memory keys, and the remembered device session. */
export function VaultProvider(props: PropsWithChildren): ReactElement {
  const { children } = props;
  const { user } = useAuth();

  const [vaultStatus, setVaultStatus] = useState<VaultStatus>(user ? "loading" : "no-vault");
  const [contentRevealed, setContentRevealed] = useState(false);
  const sessionRef = useRef<VaultSession | null>(null);
  const vaultInfoRef = useRef<VaultInfo | null>(null);

  /** Persist the unlocked session (non-extractable KEK + private key only) to this device. */
  const persistSession = async (): Promise<void> => {
    const session = sessionRef.current;
    if (!user || !session?.rememberedUntil || !vaultInfoRef.current) return;
    await saveVaultSession({
      userId: user.id,
      kek: session.kek,
      privateKey: session.privateKey,
      vaultInfo: vaultInfoRef.current,
      expiresAt: session.rememberedUntil,
    });
  };

  /**
   * Persist a remembered session, or drop any copy already on this device so a stale KEK can't
   * outlive a session that isn't remembered.
   */
  const syncPersistedSession = async (): Promise<void> => {
    // Best-effort: saveVaultSession swallows storage failures so they can't break the caller.
    if (sessionRef.current?.rememberedUntil) await persistSession();
    else void clearVaultSession();
  };

  const startSession = (keys: VaultKeys, remember: boolean): void => {
    sessionRef.current = {
      ...keys,
      dekCache: new Map(),
      rememberedUntil: remember ? Date.now() + REMEMBER_DEVICE_MS : null,
    };
  };

  /** Rehydrate a remembered session; the recovery key is re-unwrapped with the restored KEK. */
  const tryRestoreSession = async (userId: string, info: VaultInfo): Promise<boolean> => {
    const record = await loadVaultSession(userId);
    if (!record) return false;
    // Reject a KEK persisted before a password rotation on another device (the salt changed).
    if (record.vaultInfo.kekSalt !== info.kekSalt) {
      void clearVaultSession();
      return false;
    }
    try {
      const recoveryKey = await unwrapRecoveryKey(record.kek, info);
      sessionRef.current = {
        kek: record.kek,
        privateKey: record.privateKey,
        recoveryKey,
        dekCache: new Map(),
        rememberedUntil: record.expiresAt,
      };
      return true;
    } catch {
      void clearVaultSession();
      return false;
    }
  };

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
    setContentRevealed(false);
    setVaultStatus("locked");
  };

  const unlockVault = async (password: string, remember: boolean) => {
    // Re-fetch so a password rotated on another device (new KEK salt) isn't derived against a
    // stale cached salt.
    const info = (await fetchVaultInfo()) ?? vaultInfoRef.current;
    if (!info) throw new Error("Vault info not loaded");
    vaultInfoRef.current = info;

    try {
      startSession(await unlockVaultKeys(password, info), remember);
      setVaultStatus("unlocked");
    } catch (err) {
      // Never leave a stale session (and its DEK cache) behind a failed unlock.
      sessionRef.current = null;
      throw err;
    }

    await syncPersistedSession();
  };

  const setupVault = async (password: string) => {
    const result = await createVault(password);
    startSession(result.keys, false);
    vaultInfoRef.current = result.vaultInfo;
    return { recoveryKey: result.recoveryKey };
  };

  const activateVault = async (remember: boolean) => {
    const session = sessionRef.current;
    if (!session) throw new Error("Vault has not been set up");
    session.rememberedUntil = remember ? Date.now() + REMEMBER_DEVICE_MS : null;
    setVaultStatus("unlocked");
    await persistSession();
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
    if (!session || !user) throw new Error("Vault must be unlocked to initialize project keys");

    const dek = await createProjectSelfGrant(projectId, user.id, session.kek);
    await createProjectRecoveryGrant(projectId, user.id, dek, session.recoveryKey);
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
    // Re-fetch: a recovery-key regeneration since unlock changed the wrapped recovery key, and
    // re-wrapping a stale copy would silently resurrect the old recovery key.
    const info = (await fetchVaultInfo()) ?? vaultInfoRef.current;
    if (!info) throw new Error("Vault info not loaded");

    const result = await changeVaultPasswordOps(newPassword, session.kek, info, session.dekCache);

    session.kek = result.kek;
    vaultInfoRef.current = result.vaultInfo;
    // The persisted KEK belongs to the old password: replace it, or drop it if not remembered.
    await syncPersistedSession();
  };

  const recoverVault = async (recoveryKey: string, newPassword: string, remember: boolean) => {
    const result = await recoverVaultOps(recoveryKey, newPassword);
    startSession(result.keys, remember);
    vaultInfoRef.current = result.vaultInfo;
    setVaultStatus("unlocked");
    await syncPersistedSession();
  };

  const regenerateRecoveryKey = async (): Promise<RecoveryKeyResult> => {
    const session = sessionRef.current;
    if (!session) throw new Error("Vault must be unlocked to regenerate recovery key");

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
    contentRevealed,
    revealContent: () => setContentRevealed(true),
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
