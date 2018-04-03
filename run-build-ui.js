/* eslint no-process-env: "off" */
/* eslint no-undef: "off" */
/* eslint no-console: "off" */
/* eslint one-var: "off" */
/* eslint vars-on-top: "off" */
var webpack = require('webpack');
var commons = require('./webpack.config.js');
var config = {
  entry: {
    index: [
      'vendor/ui/Framework.js'
    ]
  },
  output: {
    path: __dirname + '/build',
    filename: '[name].js',
    devtoolModuleFilenameTemplate: '[resource-path]',
    library: 'module.exports',
    libraryTarget: 'assign'
  },
  module: {
    rules: commons.rules
  },
  resolve: {
    modules: commons.modules,
    alias: {}
  },
  plugins: [
  ]
};

var compiler = webpack(config);
compiler.run(()=>{
  console.log('Compiled successfully');
});
