// Observe the existing active Vditor mode; never switch the user's preference.
export const visibleMarkdownInput = root => `[...document.querySelectorAll(${JSON.stringify(root+' [contenteditable="true"]')})].find(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')`
