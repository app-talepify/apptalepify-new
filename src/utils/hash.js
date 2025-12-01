export const simpleHash = (input) => {
  try {
    const str = String(input || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    // Convert to unsigned hex string
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  } catch (e) {
    return '00000000';
  }
};

export default simpleHash;
