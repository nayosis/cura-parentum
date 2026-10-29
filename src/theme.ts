import { createTheme, type MantineColorsTuple } from "@mantine/core";

/*
 * Patte graphique : même socle que Custos Domus (fonds crème, sombre brun), mais prune pour l'action,
 * pour ne pas confondre les deux applications.
 */
const prune: MantineColorsTuple = ["#f8eef3", "#efdbe5", "#deb5c9", "#cc8dab", "#bb6b92", "#a2527e", "#7a3b5e", "#69324f", "#582a43", "#472136"];

/** Gris chauds (mode sombre) : du sable clair au brun presque noir. */
const dark: MantineColorsTuple = ["#e0d9d2", "#c4bab0", "#9c9187", "#776d64", "#544b44", "#3f3832", "#2f2a26", "#25211e", "#1d1a17", "#151311"];

export const theme = createTheme({
  primaryColor: "prune",
  primaryShade: { light: 6, dark: 4 },
  colors: { prune, dark },
  defaultRadius: "md",
  fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
  headings: { fontFamily: "Georgia, Cambria, 'Times New Roman', serif", fontWeight: "600" },
});
