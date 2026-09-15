export const BOOT_STORAGE_KEY = "zkx8004:boot";

/** Inline script that hides the boot screen before paint for returning visitors. */
export const bootPrepaintScript = `try{if(sessionStorage.getItem("${BOOT_STORAGE_KEY}")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.boot="done"}catch(e){}`;
