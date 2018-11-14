"use strict";

const { ArtNet } = require("./ArtNet.js");


/**
 * GridzillaTransform.js
 * This class will transform a screen buffer to ArtNet data for the Gridzilla light display.
 * 
 * See README.md for more details
 */


/**   
 * To illustrate the screen buffer
 * An example 3x3 screen
 * var screen = [[[0,0 RGB],[0,1 RGB],[0,2 RGB]],
 * [[1,0 RGB],[1,1 RGB],[1,2 RGB]],
 * [[2,0 RGB],[2,1 RGB],[2,2 RGB]]
 * ];
 * 
 * 7,8,9
 * 4,5,6
 * 1,2,3
 * 
 *var screen = [
 *  [[1, 1, 1], [4, 4, 4], [7, 7, 7]],
 *  [[2, 2, 2], [5, 5, 5], [8, 8, 8]],
 *  [[3, 3, 3], [6, 6, 6], [9, 9, 9]]];
 */


const controllerAddresses = ["10.7.87.6","10.7.87.8","10.7.87.10"];
const universeInfos = [];


class GridzillaTransform {

    constructor() {
        this.artnet = new ArtNet();
        
        //configure universes
        for (var controllerIndex = 0; controllerIndex < controllerAddresses.length; ++controllerIndex){
            for (var i = 0; i < GridzillaTransform.universesPerController; ++i){
            

                let universeInfo = {
                    "address": controllerAddresses[controllerIndex],
                    "universe": i,
                    "sourcePort": 6454,
                    "sendOnlyChangeData": false,
                    "sendSequenceNumbers": false
                };
                
                universeInfos[universeInfos.length] = universeInfo;
                this.artnet.configureUniverse(universeInfo);
            }
        }
    }

    transformScreen(screen){
        
        //transform all universes
        for (var controllerIndex = 0; controllerIndex < controllerAddresses.length; ++controllerIndex){
          let universeIndex = 0;
            for (var rowIndex = GridzillaTransform.controllerHeight - 1; rowIndex >= 0; --rowIndex){
                this.transformControllerRow(screen, 
                    GridzillaTransform.universeWidth * GridzillaTransform.controllerWidth * controllerIndex, 
                    GridzillaTransform.universeHeight * rowIndex, 
                    controllerAddresses[controllerIndex], 
                    universeIndex);
                universeIndex+=GridzillaTransform.controllerWidth;
            }
        }
     
        //send all universes
        for (var universeIndex = 0; universeIndex < universeInfos.length; ++universeIndex){
             this.artnet.send(universeInfos[universeIndex].address, universeInfos[universeIndex].universe);
        }
    }

    transformControllerRow(screen, xOffset, yOffset, address, universe){
        for (var i = 0; i < GridzillaTransform.controllerWidth; ++i){
            this.transformUniverse(screen, xOffset + GridzillaTransform.universeWidth * i, yOffset, address, universe + i);
        }
    }

    transformUniverse(screen, xOffset, yOffset, address, universe) {
        //channels use a 1 based index
        var channelIndex = 1;
        var up = true;
        //go accross the width
        for (var x = 0; x < GridzillaTransform.universeWidth; ++x){
            //up or down the height
            if (up) {
                for (var y = 0; y < GridzillaTransform.universeHeight; ++y) {
                    //get the RGB color
                    this.artnet.setChannelData(address, universe, channelIndex, screen.getPixelColors(xOffset + x, yOffset + y));
                    channelIndex += 3;
                }
                up = false;
            }
            else {
                for (var y = GridzillaTransform.universeHeight - 1; y >= 0; --y) {
                    //get the RGB color
                    this.artnet.setChannelData(address, universe, channelIndex, screen.getPixelColors(xOffset + x, yOffset + y));
                    channelIndex += 3;
                }
                up = true;
            }
        }
    }
}

//How many universes are in a controller
GridzillaTransform.controllerWidth = 4;
GridzillaTransform.controllerHeight = 3;
GridzillaTransform.universesPerController = GridzillaTransform.controllerWidth * GridzillaTransform.controllerHeight;
//Hom many pixels are in a universe
GridzillaTransform.universeWidth = 14;
GridzillaTransform.universeHeight = 12;

exports.GridzillaTransform = GridzillaTransform;

