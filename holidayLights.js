"use strict";

// HTTP server support
const Express = require("express");
const Http = require("http");
const SocketIo = require("socket.io");

const BodyParser = require("body-parser");
const Cors = require("cors");

const { v4: uuidV4 } = require('uuid');
const EnvConfig = require("./envConfig.js");
const TransformFactory = require("./TransformFactory.js");

const BitmapBuffer = require("./BitmapBuffer.js");

const Color = require("./Color.js");
const { colorNameToRgb } = require("./config-colors.js");

//////////////////////////////////////////////////////////////////////////////
// Scenes
//////////////////////////////////////////////////////////////////////////////

const BannerScene = require("./BannerScene.js");
const MessageScene = require("./MessageScene.js");
const CheerScene = require("./CheerScene.js");
const ImageScene = require("./ImageScene.js");
// const SnakesScene = require("./SnakesScene.js");
const ScrollingTextScene = require("./ScrollingTextScene.js");

//////////////////////////////////////////////////////////////////////////////
// Managers
//////////////////////////////////////////////////////////////////////////////

const ImageManager = require("./ImageManager.js");
const NameManager = require("./NameManager.js");

const nameManager = new NameManager();
console.log(`loading names  @${new Date()} ...`);
nameManager.loadNameLists();
console.log(`loading names complete  @${new Date()}`);

const SuggestionManager = require("./SuggestionManager.js");
const suggestionManager = new SuggestionManager();
suggestionManager.loadSuggestions();

//////////////////////////////////////////////////////////////////////////////
// Scene management
//////////////////////////////////////////////////////////////////////////////

let sceneIndex = -1;
let pauseTimer = null;
let forcePauseTimer = null;

const scenePeriod = 300000; // 5 minutes
const pauseWaitPeriod = 15000; // 15 seconds

function onPaused()
{
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
  if (forcePauseTimer) {
    clearTimeout(forcePauseTimer);
    forcePauseTimer = null;
  }
  startNextScene();
}

function forcePause() {
  scenes[sceneIndex].forcePause();
}

function pauseScene() {
  scenes[sceneIndex].pause();

  forcePauseTimer = setTimeout(forcePause, pauseWaitPeriod);
}

function startNextScene() {
  if (++sceneIndex >= scenes.length) sceneIndex = 0;

  //console.log("running scene "+ sceneIndex);

  //set the timeout before telling the scene to run
  //if the scene has nothing to do, it will call onPause and cancel the timeout
  pauseTimer = setTimeout(pauseScene, scenePeriod);
  scenes[sceneIndex].run();
}

// create scenes
let messagesScene;
let cheersScene;
// Array of scenes, initialized at start up
let scenes;


//////////////////////////////////////////////////////////////////////////////
// the HTTP server
//////////////////////////////////////////////////////////////////////////////

// the name "app" follows the Express "naming convention"
const app = Express();
const server = Http.Server(app);

app.use(BodyParser.urlencoded( { extended: true } ) );
app.use(BodyParser.json());
app.use(Cors());
//app.options('*', Cors());

// the name "io" follows the Socket.io "nameing convention"
const io = SocketIo(server, {
    cors: {
      origin: "https://farmsteadlights.com",
      methods: ["GET", "POST"],
      // allowedHeaders: ["my-custom-header"],
      // credentials: true
    }
  });

//////////////////////////////////////////////////////////////////////////////
// routing
//////////////////////////////////////////////////////////////////////////////

// ----- utilities -----
app.get("/status", function(request, response) {
  try {
    const messages = {
      ready: messagesScene.getActiveRequestCount(),
      queued: messagesScene.getQueuedRequestCount(),
      requests: messagesScene.getRequestCount()
    };

    let cheers;
    if (cheersScene) {
      cheers = {
        ready: cheersScene.getActiveRequestCount(),
        queued: cheersScene.getQueuedRequestCount(),
        requests: cheersScene.getRequestCount()
      };
    }

    const suggestions = { count: suggestionManager.getSuggestions().length }

    return response.json({
      messages,
      cheers,
      suggestions
    });
  } catch (error) {
    return response.json({
      status: "Error",
      error: error.toString()
    });
  }
});

function checkSessionId(request, response) {
  if (!request.body.sessionId) {
    request.body.sessionId = uuidV4();
  }
}

app.post("/names", function(request, response) {
  return nameManager.addName(request, response);
});

// check name
app.post("/names/:name", function(request, response) {
  return nameManager.checkName(request, response);
});

// ----- scenes -----

app.post("/messages", function(request, response) {
  checkSessionId(request, response);
  return messagesScene.addMessage(request, response);
});

app.get("/messages", function(request, response) {
  try {
    const queue = messagesScene.getMessageQueue();
    return response.json({
      queue
    });
  } catch (error) {
    return response.json({
      status: "Error",
      error: error.toString()
    });
  }
});

app.post("/cheers", function(request, response) {
  checkSessionId(request, response);
  return cheersScene.addCheer(request, response);
});

app.get("/cheers", function(request, response) {
  try {
    const queue = cheersScene.getCheerQueue();
    return response.json({
      queue
    });
  } catch (error) {
    return response.json({
      status: "Error",
      error: error.toString()
    });
  }
});

// app.post("/avatars", function(request, response) {
//   return avatarScene.addAvatar(request, response);
// });

// app.get("/triviaQuestions", function(request, response) {
//   return triviaScene.getQuesions(request, response);
// });

// app.post("/trivaResults", function(request, response) {
//   return triviaScene.addName(request, response);
// });

// app.get("/pollQuestions", function(request, response) {
//   return pollScene.addName(request, response);
// });

// app.get("/pollResults", function(request, response) {
//   return pollScene.addName(request, response);
// });

app.post("/suggestions", function(request, response) {
  return suggestionManager.addSuggestion(request, response);
});

app.get("/suggestions", function(request, response) {
  try {
    const suggestions = suggestionManager.getSuggestions();
    return response.json({
        suggestions
    });
  } catch (error) {
    return response.json({
      status: "Error",
      error: error.toString()
    });
  }
});

//////////////////////////////////////////////////////////////////////////////
// scene configuration
//////////////////////////////////////////////////////////////////////////////

const gridzillaDefaults = {
  scrollSceneDefaultsWithHeader: {
    headerTextTop: 3,
    scrollTextTop: 18,
    typeface: "*default*", fontSize: 12,
    speed: 30    
  },
  scrollSceneDefaultsNoHeader: {
    scrollTextTop: 10,
    typeface: "*default*", fontSize: 12,
    speed: 30
    }
};

const facadeDefaults = {
  scrollSceneDefaultsWithHeader: {
    headerTextTop: 2*15 - 2,
    scrollTextTop: 3*15 - 2,
    typeface: "*default*", fontSize: 12,
    speed: 60
  },
  scrollSceneDefaultsNoHeader: {
    scrollTextTop: 3*15 - 2,
    typeface: "*default*", fontSize: 12,
    speed: 60
    }
};

const teamMembers = 
  ".                             Mark Callegari (The Creator of Holiday Lights),"
+ " Chris Callegari,"
+ " Blake Stewart,"
+ " Chris Maloney,"
+ " Ken & Min Vrana,"
+ " Mike McCamon,"
+ " Steve Bullard,"
+ " Kyle Weafer,"
+ " Foley Rental & Josh Rose,"
+ " Pretech Precast Concrete,"
+ " Enerfab Midwest & Brian Jackson,"
+ " Lowes on Stateline,"
+ " T.J. Kilian and KJO Media,"
+ " Jolt Lighting,"
+ " Gieske Custom Metal Fabricators,"
+ " & The Farmstead Team:"
+ " Jerry, Walt, Virgil, Kathi, Laurie, Orrin, Matt."
+ "                           .";

function configureHolidayScenes(gridzilla) {

  // create scenes
  const welcomeBanner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Welcome to",
      line2: "Holiday Lights",
      line3: "on Farmstead Lane   ",
      color: new Color(colorNameToRgb["White"]),
      period: 2000
    });

  const instructionsBanner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Tune to 90.5 FM",
      line2: "to hear the music.",
      line3: "Please turn off your headlights.",
      color: new Color(colorNameToRgb["Dark Red"])
    });

  const instructions2Banner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Visit farmsteadlights.com",
      line2: "to send suggestions to the elves",
      //line2: "to display messages",
      line3: "and see the song list.",
      color: new Color(colorNameToRgb["Dark Red"])
    });

    const instructions3Banner = new BannerScene(gridzilla, onPaused,
      {
        line1: "The message and cheer features ",
        line2: "are currently disabled.  We",
        line3: "hope to bring those back soon.",
        color: new Color(colorNameToRgb["Dark Red"])
      });
  
  const hashtagBanner = new BannerScene(gridzilla, onPaused,
    {
      line1: "#farmsteadlights",
      line2: "Post photos & selfies",
      color: new Color(colorNameToRgb["Dark Red"])
    });
  
    
  const holidaySampleMessages = [
    { sample: true, recipient: "Everyone", message: "Happy Holidays", sender: "Team Holiday Lights", color: "Teal" },
    { sample: true, recipient: "Amy", message: "Happy Winter Solstice", sender: "Sheldon", color: "Cornflower Blue" },
    { sample: true, recipient: "Lucy", message: "Happy Holidays", sender: "Charlie", color: "Purple" },
    { sample: true, recipient: "Santa", message: "Merry Christmas", sender: "Buddy", color: "Red" },
    { sample: true, recipient: "Everyone", message: "Live Long and Prosper", sender: "Spock", color: "Lime"}, 
    { sample: true, recipient: "Mila and Emmy", message: "Merry Christmas", sender: "Rachel & Chris", color: "Pink"}, 
  ];

  messagesScene = new MessageScene(gridzilla, null, onPaused, nameManager,
    {
      sampleMessages: holidaySampleMessages
    });

  cheersScene = new CheerScene(gridzilla, onPaused, nameManager, {});


  const goChiefsScene = new ImageScene(gridzilla, onPaused,
    {
      period: 10000,
      imagesConfiguration: [
        { name: "Go Chiefs.png" }
      ]
    });

  //show holiday images
  const holidayImageScene = new ImageScene(gridzilla, onPaused,
    {
      period: 10000,
      perImagePeriod: 9000,
      imagesConfiguration: [
        { name: "Christmas Snoopy Tree 168x36 (2019 V1).png" },
        { name: "Christmas Train 830x36 (2019 V7).png", period: 29000 },
        { name: "Sleigh 168x36 (2019 V3).png" },
        { name: "Snow Landscape 168x36 (2019 V3 Blue Background).png" },
        { name: "Snow Landscape Red 168x36 (2019 V1).png" },
        { name: "Winter Wonderland 168x36 (2019 V3 Blue Background).png" },
        { name: "Like Christmas 168x36 (2019 V1).png" },
        { name: "Sleigh Ride 268x36 (2019 V1).png" },
    
        { name: "brown paper packages.png" },
        { name: "jinglebells.png" }
      ]
    });

  //show holiday images
  const thankYouImageScene = new ImageScene(gridzilla, onPaused,
    {
      period: 10000,
      perImagePeriod: 9000,    
      imagesConfiguration: [
        { name: "Foley Logo 36x168.gif" },
        { name: "Enerfab Logo 36x168.gif" },
        { name: "Jolt Lighting Logo 36x106.gif" },
        { name: "Foley Logo 36x168.gif" },
        { name: "Pretech Logo 36x168.gif" },
        { name: "Lowes_78x36_V2.png"}
      ]
    });


  // const preSnakesBanner = new BannerScene(gridzilla, onPaused,
  //   {
  //     line1: "Let's Play Snakes!",
  //     line2: "Go to farmsteadlights.com",
  //     line3: "to play snakes here.",
  //     color: new Color(colorNameToRgb["Orange"])
  //   } );
  // const snakeScene = new SnakesScene(gridzilla, onPaused, nameManager, io, {});


  const thankYouScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      period: 4*60*1000,
      headerText: "Thanks!",
      scrollText: teamMembers,
      minimumInterval: 9*60*1000,
      color: new Color(colorNameToRgb["Dark Red"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } )
  );
  
  const thanksFrontLineYouScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      period: 4*60*1000,
      headerText: "Thanks!",
      scrollText: "        Thank you healthcare workers, first reponsders, and veterans!        ",
      minimumInterval: 9*60*1000,
      color: new Color(colorNameToRgb["Blue"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Blue"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Blue"]) } )
  );

  scenes = [
    welcomeBanner,
    instructionsBanner,
    instructions2Banner,
    instructions3Banner,
    hashtagBanner,
    // goChiefsScene,
    //messagesScene,
    //cheersScene,
    holidayImageScene,
    thankYouImageScene,
    // preSnakesBanner,
    // snakeScene,
    thankYouScene,
    thanksFrontLineYouScene
  ];

}

function configureValentineScenes(gridzilla, facade) {

  const vDayImageNames = [
    "couple and hearts.png",
    "heart 25x20.png",
    "rose 38x38.png",
    "woodstock 38x38.png"
  ];

  const vDaySampleMessages = [
    { sample: true, recipient: "Rachel", message: "Will you be my Valentine?", sender: "Chris", imageName: "Rose"} ,
    { sample: true, recipient: "Sheldon", message: "I love you", sender: "Amy", imageName: "Couple" },
    { sample: true, recipient: "Lucy", message: "Will you be my Valentine?", sender: "Charlie", imageName: "Heart" },
    { sample: true, recipient: "Everyone", message: "Live Long and Prosper", sender: "Spock", imageName: "Ghost" }, 
    { sample: true, recipient: "Mom", message: "Happy Valentine's Day", sender: "Kyle", imageName: "Birdy" }
  ];
  
  // create scenes
  const welcomeScene = new ScrollingTextScene(gridzilla, facade, onPaused,
    {
      imageNames: vDayImageNames,
      scrollText: "             "
        + " Happy Valentine's Day!    "
        + " Visit farmsteadlights.com to display your Valentine."
        + "             "
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsNoHeader,
      {color: new Color(255, 200, 200)} ),
    Object.assign(facadeDefaults.scrollSceneDefaultsNoHeader,
      {color: new Color(255, 200, 200)} )
  );

  messagesScene = new MessageScene(gridzilla, facade, onPaused, nameManager,
    {
      imageNames: vDayImageNames,
      sampleMessages: vDaySampleMessages    
    },
    {},
    facadeDefaults.scrollSceneDefaultsNoHeader
  );

  scenes = [
    welcomeScene,
    messagesScene
  ];

}

function configureEosScenes(gridzilla, facade) {

  // const eosImageNames = [
  //   "rose 38x38.png"
  // ];

  
  // const goChiefsScene = new ImageScene(gridzilla, onPaused,
  //   {
  //     period: 10000,
  //     imagesConfiguration: [
  //       { name: "Go Chiefs.png" }
  //     ]
  //   });

  const goChiefsScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      scrollText: "   Go Chiefs!   Go Chiefs!   Go Chiefs!   Go Chiefs!   Go Chiefs!       ",
      color: new Color(colorNameToRgb["Dark Red"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } )
  );

  // create scenes
  const eosMessageScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      // imageNames: eosImageNames,
      headerText: "Thanks for visiting!",
      scrollText: "             "
       + "The Holiday Lights show has ended. See you next year.    "
       //+ "Join us in February to display your Valentines! "
       //+ "Deanna Rose Children's Farmstead will reopen April 1st!"
       + "                "
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      {color: new Color(255, 255, 255)} ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      {color: new Color(255, 255, 255)} )
  );

  // const thankYouScene = new ScrollingTextScene(gridzilla, null, onPaused,
  //   {
  //     period: 180*60*1000,
  //     headerText: "Thanks!",
  //     scrollText: teamMembers,
  //     minimumInterval: 5*60*1000
  //   },
  //   Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
  //     {color: new Color(255, 255, 255)} ),
  //   Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
  //     {color: new Color(255, 255, 255)} )
  // );

  scenes = [
    eosMessageScene,
    goChiefsScene,
    //thankYouScene
  ];

}

function configureFontTestScenes(gridzilla, facade) {

  const test1 = new BannerScene(gridzilla, onPaused,
    {
      line1: "abcdefghijklmnopqrstuvwxyz",
      line2: "ABCDEFGHIJKLM",
      line3: "NOPQRSTUVWXYZ",
      color: new Color(colorNameToRgb["White"]),
      period: 12000
    });

    const test2 = new BannerScene(gridzilla, onPaused,
      {
        line1: "0123456789",
        line2: "\"'`^@#$%^&*=+-~_",
        line3: "()[]{}<>|\\/.,;:?!",
        color: new Color(colorNameToRgb["White"]),
        period: 12000
      });
  
  const messageScene = new ScrollingTextScene(gridzilla, facade, onPaused,
    {
      headerText: "abcdefghijklmnopqrstuvwxyz",
      scrollText: "             "
       + "abcdefghijklmnopqrstuvwxyz"
       + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
       + "0123456789"
       + "\"'`^@#$%^&*=+-~_"
       + "()[]{}<>|\\/.,;:?!"
       + "                "
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } )
  );

  scenes = [
    //test1,
    //test2,
    messageScene
  ];

}

function configureHalloweenScenes(gridzilla) {

  // create scenes
  const welcomeBanner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Welcome to",
      line2: "Holiday Lights",
      line3: "on Farmstead Lane   ",
      color: new Color(colorNameToRgb["White"]),
      period: 3000
    });

  // create scenes
  const halloweenMessageScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      // imageNames: eosImageNames,
      headerText: "Happy Halloween!",
      scrollText: "             "
       + "          The Holiday Lights show begins Thanksgiving evening.  "
       + "The elves are working hard to get the show ready.  "
       + "This is only a test!  Please come back to see the show.        "
       + "         ",
       color: new Color(colorNameToRgb["Orange"])
      },
      Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Orange"]) } ),
      Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Orange"]) } )
    );

  //show Halloween images
  const halloweenImageScene = new ImageScene(gridzilla, onPaused,
    {
      period: 10000,
      perImagePeriod: 9000,
      imagesConfiguration: [
        { name: "ghost.png" },
        { name: "pumpkin.png" },
        { name: "woodstock 38x38.png" },
        { name: "snowman.png" },
        { name: "snowflake.png" },
      ]
    });

  const goChiefsScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      scrollText: "   Go Chiefs!   Go Chiefs!   Go Chiefs!   Go Chiefs!   Go Chiefs!       ",
      color: new Color(colorNameToRgb["Dark Red"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } )
  );

  const goSportingScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      scrollText: "        Go Sporting KC!   Go Sporting KC!   Go Sporting KC!        ",
      color: new Color(colorNameToRgb["Sporting Blue"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Sporting Blue"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Sporting Blue"]) } )
  );
  
  scenes = [
    welcomeBanner,
    halloweenMessageScene,
    halloweenImageScene,
    goChiefsScene,
    halloweenImageScene,
    goSportingScene
  ];

}

function configurePreSeasonScenes(gridzilla) {

  // create scenes
  const welcomeBanner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Welcome to",
      line2: "Holiday Lights",
      line3: "on Farmstead Lane   ",
      color: new Color(colorNameToRgb["White"]),
      period: 3000
    });

  // create scenes
  const preSeasonMessageScene = new ScrollingTextScene(gridzilla, null, onPaused,
      {
      period: 120000,
      headerText: "Happy Pre-Holidays!",
      scrollText: "             "
        + "         "
        + "The Holiday Lights show begins Thanksgiving evening.  "
        + "The elves are working hard to get the show ready.  "
        + "Please come back to see the show.         "
        + "         ",
      color: new Color(colorNameToRgb["Blue"])
      },
      Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Green"]) } ),
      Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Green"]) } )
    );

  //show images
  const preSeasonImageScene = new ImageScene(gridzilla, onPaused,
    {
      period: 10000,
      perImagePeriod: 9000,
      imagesConfiguration: [
        { name: "snowman.png" },
        { name: "snowflake.png" },
        { name: "Christmas Snoopy Tree 168x36 (2019 V1).png" },
        { name: "Christmas Train 830x36 (2019 V7).png", period: 29000 },
      ]
    });

  const goChiefsScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      scrollText: "   Go Chiefs!   Go Chiefs!   Go Chiefs!   Go Chiefs!   Go Chiefs!       ",
      color: new Color(colorNameToRgb["Dark Red"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) } )
  );

  const goSportingScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      scrollText: "        Go Sporting KC!   Go Sporting KC!   Go Sporting KC!        ",
      color: new Color(colorNameToRgb["Sporting Blue"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Sporting Blue"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Sporting Blue"]) } )
  );

  const thanksFrontLineYouScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      scrollText: "        Thank you healthcar workers, first reponsders, and veterans!        ",
      color: new Color(colorNameToRgb["Blue"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Blue"]) } ),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Blue"]) } )
  );
  
  scenes = [
    welcomeBanner,
    preSeasonMessageScene,
    preSeasonImageScene,
    thanksFrontLineYouScene,
    goChiefsScene,
    goSportingScene
  ];

}

//////////////////////////////////////////////////////////////////////////////
// the "start-up" code
//////////////////////////////////////////////////////////////////////////////

const port = process.env.PORT || 8000;

EnvConfig.loadOverrides();

BitmapBuffer.initializeFonts().then( () =>  {
  ImageManager.initialize().then( () => {
    let gridzilla = TransformFactory.getGridzillaTransform();
    let facade = TransformFactory.getFacadeTransform();

    // configure the scenes
    let show = EnvConfig.get().show;
    if (!show) {
      show = "Holiday";
    }
    if (show === "Valentine")
      configureValentineScenes(gridzilla, facade);
    else if (show === "Holiday")
      configureHolidayScenes(gridzilla);
      else if (show === "Halloween")
      configureHalloweenScenes(gridzilla);
   else if (show === "PreSeason")
      configurePreSeasonScenes(gridzilla);
    else if (show === "EOS")
      configureEosScenes(gridzilla, facade);
    else if (show == "fontTest")
      configureFontTestScenes(gridzilla, facade);

    startListening();
  });
});

function startListening() {

  // Socket.io initialization

  io.on("connection", function(socket) {
    console.log("Socket.io user connection: " + socket.id);

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
      const scene = scenes[sceneIndex];
      if (scene.onUserConnected) {
        scene.onUserConnected(socket);
      }
    }

    socket.on("disconnect", function(error) {
      console.log(`Socket.io user disconnected: ${socket.id} error=${error.toString}`);

      for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
        const scene = scenes[sceneIndex];
        if (scene.onUserDisconnected) {
          scene.onUserDisconnected(socket);
        }
      }
    });

  });

  // start the server
  server.listen(port, function() {
    console.log("Holiday Lights server listening on port " + port);
  });

  startNextScene();
}
