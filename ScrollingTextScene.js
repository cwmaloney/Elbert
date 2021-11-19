const BitmapBuffer = require("./BitmapBuffer.js");
const Font = require("./Font.js");
const Color = require("./Color.js");
//const {colorNameToRgb} = require("./config-colors.js");
//const Jimp = require('jimp');
const HorizontalScroller = require("./HorizontalScroller.js");
// const TimestampUtilities = require("./TimestampUtilities.js");
const ImageManager = require("./ImageManager.js");

class ScrollingTextScene {

  constructor(gridzilla, facade, onPaused, configuration, gridzillaConfiguration, facadeConfiguration) {
    this.gridzilla = gridzilla;
    this.facade = facade;
    this.onPaused = onPaused;
    this.configure(configuration, gridzillaConfiguration, facadeConfiguration);
  
    this.paused = false;
  }

  configure(configuration, gridzillaConfiguration, facadeConfiguration) {
    const defaults = {
      period: 5000, // time scene should run

      imageNames: [],
      headerText: null,
      scrollText: null,
      minimumInterval: 0, // this minimum interval between repeating this message
    };

    const defaultGridzillaConfiguration = {
      color: new Color(255, 255, 255),
      backgroundColor: new Color(0, 0, 0),

      speed: 50, // speed is ms between moves

      typeface: "*default*", fontSize: 12,

      scrollHeaderTop: undefined,
      scrollTextTop: undefined
    };

    const defaultFacadeConfiguration = {
      color: new Color(255, 255, 255),
      backgroundColor: new Color(0, 0, 0),

      speed: 30, // speed is ms between moves

      typeface: "*default*", fontSize: 12,

      scrollHeaderTop: undefined,
      scrollTextTop: undefined
    };

    this.configuration = Object.assign(defaults, configuration);
    this.facadeConfiguration = Object.assign(defaultFacadeConfiguration, facadeConfiguration);
    this.gridzillaConfiguration = Object.assign(defaultGridzillaConfiguration, gridzillaConfiguration);

    this.facadeConfiguration.font = new Font(this.facadeConfiguration.typeface, this.facadeConfiguration.fontSize, this.facadeConfiguration.color);
    this.gridzillaConfiguration.font = new Font(this.gridzillaConfiguration.typeface, this.gridzillaConfiguration.fontSize, this.gridzillaConfiguration.color);
 }

  //////////////////////////////////////////////////////////////////////////////
  // Scene control 
  //////////////////////////////////////////////////////////////////////////////

  run() {
    console.log("ScrollingTextScene run: " + this.formatMessage())
    this.paused = false;
    this.startTime = Date.now();
    this.runScene();
  }

  runScene() {
    if (this.configuration.minimumInterval) {
      const nowTime = Date.now();
      if (this.lastRunTime && (this.lastRunTime + this.configuration.minimumInterval > nowTime)){
        this.pause();
        return;
      }
    this.lastRunTime = nowTime;
    }

    const facadeTimeRequired = this.displayTextOnFacade();
    const gridzillaTimeRequired = this.displayTextOnGridzilla();
    const timeRequired = Math.max(facadeTimeRequired, gridzillaTimeRequired);

    const timeout = Math.max(timeRequired, this.configuration.period);
    this.runningTimer = setTimeout(this.onComplete.bind(this), timeout);
  }

  displayTextOnFacade() {
    let timeRequired = 0;
    if (this.facade) {
      const frameBuffer = BitmapBuffer.fromNew(this.facade.width, this.facade.height, this.facadeConfiguration.backgroundColor);

      if (this.configuration.imageNames && this.configuration.imageNames.length) {
        const index = Math.floor(Math.random()*this.configuration.imageNames.length)
        const image = ImageManager.get(this.configuration.imageNames[index]);
      
        frameBuffer.blit(image, frameBuffer.image.bitmap.width / 2 - image.bitmap.width / 2, 
            frameBuffer.image.bitmap.height / 2 - image.bitmap.height / 2 - 6);
      }
  
      this.facadeTextScroller = this.showText(this.facade, this.facadeConfiguration, frameBuffer);
      timeRequired = this.getScrollTime(this.facade, this.facadeConfiguration) + 1000; // add a second for "rounding"
    }
    return timeRequired;
  }

  displayTextOnGridzilla() {
    let timeRequired = 0;
    if (this.gridzilla) {
      const frameBuffer = BitmapBuffer.fromNew(this.gridzilla.width, this.gridzilla.height, this.gridzillaConfiguration.backgroundColor);

      this.gridzillaTextScroller = this.showText(this.gridzilla, this.gridzillaConfiguration, frameBuffer);
      timeRequired = this.getScrollTime(this.gridzilla, this.gridzillaConfiguration) + 1000; // add a second for "rounding"
    }
    return timeRequired;   
  }

  showText(output, outputConfiguration, frameBuffer){
    if (outputConfiguration.headerTextTop && this.configuration.headerText) {
      frameBuffer.print1Line(this.configuration.headerText, outputConfiguration.font, outputConfiguration.headerTextTop);
      output.transformScreen(frameBuffer);
    }

    const scroller = new HorizontalScroller(0, outputConfiguration.scrollTextTop, frameBuffer, output);
    scroller.scrollText(this.configuration.scrollText, outputConfiguration.font, outputConfiguration.speed);

    return scroller;
  }

  pause() {
    // console.log("scrollingTextScene pause: " + this.formatMessage())
    clearTimeout(this.runningTimer);

    this.killScrollers();

    this.paused = true;
    this.onPaused();
  }

  forcePause() {
    console.log("scrollingTextScene forcePause: " + this.formatMessage())
    this.pause();
  }

  killScrollers() {
    if (this.gridzillaTextScroller){
      this.gridzillaTextScroller.stop();
      this.gridzillaTextScroller = null;
    }

    if (this.facadeTextScroller){
      this.facadeTextScroller.stop();
      this.facadeTextScroller = null;
    }
  }

  onComplete() {
    this.lastRunTime = Date.now();
    this.pause();
    return;
  }

  getScrollTime(output, outputConfiguration) {
    return HorizontalScroller.calculateImageScrollTimeForText(this.configuration.scrollText, outputConfiguration.font, output.width, outputConfiguration.speed);
  }
 
  formatMessage() {
    return (this.configuration.headerText) ? `header: ${this.configuration.headerText}, ` : "" + `${this.configuration.scrollText}`;
  }
   
}

module.exports = ScrollingTextScene;
