import {createRequire} from 'node:module';
const require = createRequire('/root/projects/oceanleo/package.json');
const next = createRequire(require.resolve('eslint-config-next'));
export default [{files:['**/*.ts','**/*.tsx'],languageOptions:{parser:next('@typescript-eslint/parser'),parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},plugins:{'react-hooks':next('eslint-plugin-react-hooks')},rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn'}}];
