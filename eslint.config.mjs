import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  // Explicit React version: eslint-plugin-react's auto-detection uses an API removed in ESLint 10.
  { settings: { react: { version: "19.3" } } },
  { ignores: [".next/**", "node_modules/**", "data/**", "test-results/**", "playwright-report/**", "next-env.d.ts"] },
];

export default config;
