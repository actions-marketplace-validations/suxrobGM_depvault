"use client";

import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/auth/use-auth";
import { REMEMBER_DEVICE_MS } from "@/lib/constants";
import { createProjectKey, resolveProjectDEK, shareProjectKey } from "@/lib/crypto/vault-grants";
import {
  createVault,
  fetchVaultInfo,
  unlockVaultKeys,
  unwrapRecoveryKey,
  type VaultInfo,
  type VaultKeys,
} from "@/lib/crypto/vault-lifecycle";
import {
  changeVaultPasswordOps,
  recoverVaultOps,
  regenerateRecoveryKeyOps,
} from "@/lib/crypto/vault-rekey";
import {
  clearVaultSession,
  loadVaultSession,
  saveVaultSession,
} from "@/lib/storage/vault-session-store";

type VaultStatus = "loading" | "error" | "no-vault" | "locked" | "unlocked";

/**
 * Unlocked key material, held in a single ref (never state) so lock/logout/restore is one
 * assignment. `VaultInfo` lives apart since it survives a lock and is only cleared on logout.
 */
interface VaultSession extends VaultKeys {
  /** In-flight or resolved DEK lookups, so concurrent callers share one fetch + unwrap. */
  dekCache: Map<string, Promise<CryptoKey>>;
  /** Epoch ms the remembered device session expires, or null when it lives in memory only. */
  rememberedUntil: number | null;
}

interface RecoveryKeyResult {
  /** Formatted recovery key, shown to the user exactly once. */
  recoveryKey: string;
}

/** Client-side vault state and cryptographic operations for end-to-end encryption. */
export interface VaultContextValue {
  vaultStatus: VaultStatus;
  /** Re-fetch the vault after a failed status request. */
  retryVaultStatus: () => void;
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
  /** Generate a new project's DEK and store the caller's SELF + RECOVERY grants. */
  initializeProjectKeys: (projectId: string) => Promise<void>;
  /** Share the project DEK with a member through an ECDH-wrapped grant. */
  grantProjectKeyToMember: (
    projectId: string,
    recipientUserId: string,
    recipientPublicKey: string,
  ) => Promise<void>;
  /** Re-wrap all keys under a new password; the current password is verified first. */
  changeVaultPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Restore vault access using a recovery key and set a new password. */
  recoverVault: (recoveryKey: string, newPassword: string, remember: boolean) => Promise<void>;
  /** Generate a new recovery key and re-wrap a RECOVERY grant for every project. */
  regenerateRecoveryKey: () => Promise<RecoveryKeyResult>;
}

export const VaultContext = createContext<VaultContextValue | null>(null);

/** Manages the vault lifecycle, in-memory keys, and the remembered device session. */
export function VaultProvider(props: PropsWithChildren): ReactElement {
  const { children } = props;
  const { user } = useAuth();
  const userId = user?.id;

  const [vaultStatus, setVaultStatus] = useState<VaultStatus>(userId ? "loading" : "no-vault");
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [contentRevealed, setContentRevealed] = useState(false);
  const sessionRef = useRef<VaultSession | null>(null);
  const vaultInfoRef = useRef<VaultInfo | null>(null);

  const requireSession = (): VaultSession => {
    if (!sessionRef.current) throw new Error("Vault is locked");
    return sessionRef.current;
  };

  /**
   * Persist a remembered session (non-extractable KEK + private key only), or drop any copy on
   * this device so a stale KEK can't outlive a session that isn't remembered.
   */
  const syncPersistedSession = async (): Promise<void> => {
    const session = sessionRef.current;
    const info = vaultInfoRef.current;
    if (!userId || !session?.rememberedUntil || !info) {
      void clearVaultSession();
      return;
    }
    await saveVaultSession({
      userId,
      kek: session.kek,
      privateKey: session.privateKey,
      kekSalt: info.kekSalt,
      expiresAt: session.rememberedUntil,
    });
  };

  const startSession = (keys: VaultKeys, rememberedUntil: number | null): void => {
    sessionRef.current = { ...keys, dekCache: new Map(), rememberedUntil };
  };

  const rememberUntil = (remember: boolean) => (remember ? Date.now() + REMEMBER_DEVICE_MS : null);

  /** Rehydrate a remembered session; the recovery key is re-unwrapped with the restored KEK. */
  const tryRestoreSession = async (id: string, info: VaultInfo): Promise<boolean> => {
    const record = await loadVaultSession(id);
    if (!record) return false;
    // Reject a KEK persisted before a password rotation on another device (the salt changed).
    if (record.kekSalt !== info.kekSalt) {
      void clearVaultSession();
      return false;
    }
    try {
      const recoveryKey = await unwrapRecoveryKey(record.kek, info);
      startSession(
        { kek: record.kek, privateKey: record.privateKey, recoveryKey },
        record.expiresAt,
      );
      return true;
    } catch {
      void clearVaultSession();
      return false;
    }
  };

  // Keyed on the user id: profile edits replace the `user` object and must not reset the vault.
  // `statusAttempt` re-runs the fetch on retry.
  useEffect(() => {
    if (!userId) {
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
        const restored = sessionRef.current !== null || (await tryRestoreSession(userId, info));
        if (cancelled) return;
        setVaultStatus(restored ? "unlocked" : "locked");
      })
      .catch(() => {
        if (!cancelled) setVaultStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [userId, statusAttempt]);

  const retryVaultStatus = () => {
    setVaultStatus("loading");
    setStatusAttempt((n) => n + 1);
  };

  const lockVault = () => {
    sessionRef.current = null;
    void clearVaultSession();
    setContentRevealed(false);
    setVaultStatus("locked");
  };

  const unlockVault = async (password: string, remember: boolean) => {
    // Re-fetch so a password rotated on another device (new KEK salt) isn't derived against a
    // stale cached salt.
    const info = await fetchVaultInfo();
    if (!info) throw new Error("Vault not found");
    vaultInfoRef.current = info;

    try {
      startSession(await unlockVaultKeys(password, info), rememberUntil(remember));
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
    startSession(result.keys, null);
    vaultInfoRef.current = result.vaultInfo;
    return { recoveryKey: result.recoveryKey };
  };

  const activateVault = async (remember: boolean) => {
    requireSession().rememberedUntil = rememberUntil(remember);
    setVaultStatus("unlocked");
    await syncPersistedSession();
  };

  const getProjectDEK = (projectId: string): Promise<CryptoKey> => {
    const session = sessionRef.current;
    if (!session) return Promise.reject(new Error("Vault is locked"));

    const cached = session.dekCache.get(projectId);
    if (cached) return cached;

    const pending = resolveProjectDEK(projectId, session);
    session.dekCache.set(projectId, pending);
    // A failed lookup (missing grant, network) must be retryable, not cached.
    pending.catch(() => {
      if (session.dekCache.get(projectId) === pending) session.dekCache.delete(projectId);
    });
    return pending;
  };

  const initializeProjectKeys = async (projectId: string) => {
    const session = requireSession();
    session.dekCache.set(projectId, Promise.resolve(await createProjectKey(projectId, session)));
  };

  const grantProjectKeyToMember = async (
    projectId: string,
    recipientUserId: string,
    recipientPublicKey: string,
  ) => {
    const session = requireSession();
    const dek = await getProjectDEK(projectId);
    await shareProjectKey(projectId, recipientUserId, recipientPublicKey, dek, session.privateKey);
  };

  const changeVaultPassword = async (currentPassword: string, newPassword: string) => {
    const session = requireSession();
    // Fresh copy: re-wrapping a stale recovery key (regenerated on another device) would
    // silently resurrect the old one.
    const info = await fetchVaultInfo();
    if (!info) throw new Error("Vault not found");

    const result = await changeVaultPasswordOps(currentPassword, newPassword, info);

    session.kek = result.kek;
    vaultInfoRef.current = result.vaultInfo;
    // The persisted KEK belongs to the old password: replace it, or drop it if not remembered.
    await syncPersistedSession();
  };

  const recoverVault = async (recoveryKey: string, newPassword: string, remember: boolean) => {
    const result = await recoverVaultOps(recoveryKey, newPassword);
    startSession(result.keys, rememberUntil(remember));
    vaultInfoRef.current = result.vaultInfo;
    setVaultStatus("unlocked");
    await syncPersistedSession();
  };

  const regenerateRecoveryKey = async (): Promise<RecoveryKeyResult> => {
    const session = requireSession();
    const result = await regenerateRecoveryKeyOps(session.kek);

    session.recoveryKey = result.key;
    if (vaultInfoRef.current) {
      vaultInfoRef.current = { ...vaultInfoRef.current, ...result.vaultInfo };
    }
    return { recoveryKey: result.formatted };
  };

  const value: VaultContextValue = {
    vaultStatus,
    retryVaultStatus,
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
