/**
 * App lock helpers. Fingerprint is OPT-IN only (never prompts until enabled in Settings).
 */
import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function biometricEnabled(settings = {}) {
  return Boolean(Number(settings.biometric_lock));
}

export function pinEnabled(settings = {}) {
  return Boolean(settings.app_pin && String(settings.app_pin).trim());
}

/** Lock only when PIN is set OR biometric was explicitly turned on. */
export function lockRequired(settings = {}) {
  return pinEnabled(settings) || biometricEnabled(settings);
}

export async function checkBiometricAvailable() {
  if (!isNativeApp()) return { available: false, reason: 'web' };
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    const result = await NativeBiometric.isAvailable();
    return {
      available: Boolean(result?.isAvailable),
      biometryType: result?.biometryType,
      reason: result?.isAvailable ? 'ok' : 'unavailable',
    };
  } catch (err) {
    return { available: false, reason: err?.message || 'plugin' };
  }
}

/**
 * Prompt fingerprint / face unlock.
 * Caller must only invoke when biometric_lock is ON.
 */
export async function authenticateBiometric({ reason = 'Unlock ELITE CHOCOLATE' } = {}) {
  const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
  await NativeBiometric.verifyIdentity({
    reason,
    title: 'ELITE CHOCOLATE',
    subtitle: 'Confirm it is you',
    description: 'Use fingerprint or face to unlock',
    negativeButtonText: 'Use PIN',
    maxAttempts: 5,
  });
  return true;
}
