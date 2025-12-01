// Success modal global trigger (no-op stub)

/**
 * Shows a success modal with the given message
 * @param {string} message - The success message to display
 * @returns {void}
 */
export const showSuccess = (message) => {
  try {
    if (!message || typeof message !== 'string') return;
    if (__DEV__) {
      // Hook up a global SuccessModal provider to enable this.
    }
  } catch {}
};
