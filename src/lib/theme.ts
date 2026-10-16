export const THEME_STORAGE_KEY = "quati.theme";
export type ThemePreference = "light" | "dark" | "system";

export function themePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

// Runs in <head>, before the first body paint. Storage can be blocked by privacy settings.
export const THEME_INIT_SCRIPT = `(function(){
  var p="system";try{var v=localStorage.getItem("quati.theme");if(v==="light"||v==="dark")p=v}catch(e){}
  var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=d?"dark":"light";
  r.dataset.themePreference=p;r.style.colorScheme=d?"dark":"light";
  var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=d?"#101a17":"#f6f8fa";
})();`;
