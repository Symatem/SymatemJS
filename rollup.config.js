import pkg from './package.json';

export default {
  output: {
    file: pkg.main,
    format: 'cjs'
  },
  input: pkg.module
};
