"use strict";

const envConfig = require("./envConfig.js");
const GridzillaTransform = require("./GridzillaTransform.js");
const FacadeTransform = require("./FacadeTransform.js");
const EmulatorTransform = require("./EmulatorTransform.js");

/**
 * Get a gridzilla transformer based on the current environment
 */
function getGridzillaTransform(){
  if (envConfig.get().targetEnv == "Dev") {
    return new EmulatorTransform("Gridzilla Emulator", 14*12, 12*3, 3000);
  }
  else {
    return new GridzillaTransform();
  }
}

/**
 * Get a facade transformer based on the current environment
 */
function getFacadeTransform(){
  if (envConfig.get().targetEnv == "Dev") {
    return new EmulatorTransform("Facade Emulator", 12*8, 14*4, 3001);
  }
  else {
    return new FacadeTransform();
  }
}

module.exports = {
  getGridzillaTransform,
  getFacadeTransform
};