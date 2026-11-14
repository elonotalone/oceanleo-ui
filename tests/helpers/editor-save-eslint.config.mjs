import {createRequire} from 'node:module';
const require=createRequire('/root/projects/oceanleo/node_modules/eslint-config-next/package.json');
export default [{files:['**/*.{ts,tsx}'],languageOptions:{parser:require('@typescript-eslint/parser'),parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},plugins:{'react-hooks':require('eslint-plugin-react-hooks')},rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn'}}];
