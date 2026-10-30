import tseslint from "typescript-eslint";
export default tseslint.config(...tseslint.configs.recommended, {
  files: [
    "apps/api/src/**/*.ts",
    "apps/dashboard/src/**/*.tsx",
    "tests/**/*.ts",
  ],
  rules: { "@typescript-eslint/no-explicit-any": "off" },
});
