/** Le logo : un cœur sur fond prune (même dessin que public/icone.svg). */
export function Logo({ taille = 28 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--mantine-color-prune-6)" />
      <path d="M32 49s-17-10.2-17-23a9.5 9.5 0 0 1 17-5.8A9.5 9.5 0 0 1 49 26c0 12.8-17 23-17 23z" fill="none" stroke="#fff8f0" strokeWidth="4.5" strokeLinejoin="round" />
    </svg>
  );
}
