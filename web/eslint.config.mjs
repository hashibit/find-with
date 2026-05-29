import { FlatCompat } from '@eslint/eslintrc';
import prettierConfig from 'eslint-config-prettier';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [...compat.extends('next/core-web-vitals'), prettierConfig];
