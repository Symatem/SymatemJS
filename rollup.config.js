import pkg from './package.json';

export default {
  targets: [{
    dest: pkg.main,
    format: 'cjs'
  }],
  plugins: []
};
