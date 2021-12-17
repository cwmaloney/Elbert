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
//const CheerScene = require("./CheerScene.js");
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

function onPaused() {
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

app.use(BodyParser.urlencoded({ extended: true }));
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
app.get("/status", function (request, response) {
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

app.post("/names", function (request, response) {
  return nameManager.addName(request, response);
});

// check name
app.post("/names/:name", function (request, response) {
  return nameManager.checkName(request, response);
});

// ----- scenes -----

app.post("/messages", function (request, response) {
  checkSessionId(request, response);
  return messagesScene.addMessage(request, response);
});

app.get("/messages", function (request, response) {
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

app.post("/cheers", function (request, response) {
  checkSessionId(request, response);
  return cheersScene.addCheer(request, response);
});

app.get("/cheers", function (request, response) {
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

app.post("/suggestions", function (request, response) {
  return suggestionManager.addSuggestion(request, response);
});

app.get("/suggestions", function (request, response) {
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
// scene data
//////////////////////////////////////////////////////////////////////////////

const gridzillaDefaults = {
  scrollSceneDefaultsWithHeader: {
    headerTextTop: 3,
    scrollTextTop: 18,
    typeface: "*default*", fontSize: 12,
    speed: 45
  },
  scrollSceneDefaultsNoHeader: {
    scrollTextTop: 10,
    typeface: "*default*", fontSize: 12,
    speed: 45
  }
};

const facadeDefaults = {
  scrollSceneDefaultsWithHeader: {
    headerTextTop: 2 * 15 - 2,
    scrollTextTop: 3 * 15 - 2,
    typeface: "*default*", fontSize: 12,
    speed: 60
  },
  scrollSceneDefaultsNoHeader: {
    scrollTextTop: 3 * 15 - 2,
    typeface: "*default*", fontSize: 12,
    speed: 60
  }
};

// const holidaySampleMessages = [
//   { sample: true, recipient: "Everyone", message: "Happy Holidays", sender: "Team Holiday Lights", color: "Teal" },
//   { sample: true, recipient: "Amy", message: "Happy Winter Solstice", sender: "Sheldon", color: "Cornflower Blue" },
//   { sample: true, recipient: "Lucy", message: "Happy Holidays", sender: "Charlie", color: "Purple" },
//   { sample: true, recipient: "Santa", message: "Merry Christmas", sender: "Buddy", color: "Red" },
//   { sample: true, recipient: "Everyone", message: "Live Long and Prosper", sender: "Spock", color: "Lime" },
//   { sample: true, recipient: "Mila and Emmy", message: "Merry Christmas", sender: "Rachel & Chris", color: "Pink" },
// ];

const teamMembers =
  "                             Mark Callegari,"
  + " Chris Callegari,"
  + " Blake Stewart,"
  + " Chris Maloney,"
  + " Bill (K5EE) Jones,"
  + " Ken & Min Vrana,"
  + " Mike McCamon,"
  + " Steve Bullard,"
  + " Matt, Jerry, Kathi, & Laurie."
  + "                           ";

// const companies =
//   "-                             "
//   + " Foley Rental,"
//   + " Equipment Share,"
//   + " Pretech Precast Concrete,"
//   + " Enerfab Midwest,"
//   + " T.J. Kilian and KJO Media,"
//   + " & Jolt Lighting"
//   // + " Lowes on Stateline,"
//   // + " & Gieske Custom Metal Fabricators,"
//   + "                           -";

//////////////////////////////////////////////////////////////////////////////
// scene configuration
//////////////////////////////////////////////////////////////////////////////

function configureScenes(gridzilla, facade) {


  const welcomeBanner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Welcome to",
      line2: "Holiday Lights",
      line3: "on Farmstead Lane   ",
      color: new Color(colorNameToRgb["Dark Red"]),
      period: 3000
    });

  const instructionsBanner = new BannerScene(gridzilla, onPaused,
    {
      //The spaces get the messages centered, apparently our length estimate and centering code isn't perfect
      line1: "Tune to 90.5 FM  ",
      line2: " to hear the music.",
      line3: "Please turn off your headlights.",
      color: new Color(colorNameToRgb["Green"])
    });

  const instructions2Banner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Visit farmsteadlights.com",
      line2: "to send suggestions to the elves",
      //line2: "to display messages",
      line3: "and see the song list.",
      color: new Color(colorNameToRgb["Red"])
    });

    const headlightsBanner = new BannerScene(gridzilla, onPaused,
      {
        line1: "Please turn your",
        line2: "headlights off",
        color: new Color(colorNameToRgb["Orange"])
      });
  // const instructions3Banner = new BannerScene(gridzilla, onPaused,
  //   {
  //     line1: "The message and cheer features ",
  //     line2: "are currently disabled.  We",
  //     line3: "hope to bring those back soon.",
  //     color: new Color(colorNameToRgb["Dark Red"])
  //   });

  const instructions4Banner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Please do not block",
      line2: "the lanes on the sides",
      line3: "of the lot.",
      color: new Color(colorNameToRgb["Pink"])
    });

    const thanksMarkBanner = new BannerScene(gridzilla, onPaused,
      {
        line1: "Thanks to Mark Callegari,",
        line2: "The Creator of",
        line3: "Holiday Lights at Deanna Rose",
        color: new Color(colorNameToRgb["Pink"])
      });

  const hashtagBanner = new BannerScene(gridzilla, onPaused,
    {
      period: 6000,
      line1: "#farmsteadlights",
      line2: "Post photos & selfies",
      color: new Color(colorNameToRgb["Green"])
    });

  const instructionsFacebook = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      period: 18000,
      headerText: "Visit us on Facebook",
      scrollText: "                              HolidayLightsAtDeannaRoseFarmstead",
      color: new Color(colorNameToRgb["Green"])
      },
      Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Green"]) }),
      Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Green"]) })
    );
  
  const instructionsInstagram = new BannerScene(gridzilla, onPaused,
    {
      period: 9000,
      line1: "Visit us on Instagram",
      line2: "HolidayLightsAtDeannaRose",
      line3: " ",
      color: new Color(colorNameToRgb["Dark Red"])
    });
            
  // const holidaysMessagesScene = new MessageScene(gridzilla, null, onPaused, nameManager,
  // {
  //   sampleMessages: holidaySampleMessages
  // });

  // const holidaysCheersScene = new CheerScene(gridzilla, onPaused, nameManager, {});


  // const goChiefsImageScene = new ImageScene(gridzilla, onPaused,
  //   {
  //     period: 10000,
  //     imagesConfiguration: [
  //       { name: "Go Chiefs.png" }
  //     ]
  //   });

  //show holiday images
  const holidayImageScene = new ImageScene(gridzilla, onPaused,
    {
      period: 34000,
      perImagePeriod: 3000,
      imagesConfiguration: [
        { name: "Christmas Snoopy Tree 168x36 (2021 V2).png" },
        { name: "Snowman_Family_V4.png" },
        { name: "Sleigh 168x36 (2019 V3).png" },
        { name: "Snow Landscape 168x36 (2019 V3 Blue Background).png" },
        // { name: "Snow Landscape Red 168x36 (2019 V1).png" },
        { name: "Winter Wonderland 168x36 (2019 V3 Blue Background).png" },
        { name: "Like Christmas 168x36 (2021 V2).png" },
        { name: "Sleigh Ride 268x36 (2019 V1).png" },
        { name: "Snowman_Family_Girl_V1.png" },

        { name: "brown paper packages.png" },
        { name: "jinglebells.png" },
        { name: "snowflake.png" }
      ]
    });

  //show holiday images
  const trainImageScene = new ImageScene(gridzilla, onPaused,
    {
      period: 29000,
      imagesConfiguration: [
        { name: "Train_2021_V2.png", period: 29000 },
      ]
    });
  
  const preLogosScene = new BannerScene(gridzilla, onPaused,
    {
      line1: "We can't say thanks enough to",
      line2: "the compaines that help make",
      line3: "Holidays Lights possible . . .",
      color: new Color(colorNameToRgb["Green"])
    });
  
  // show logos
  const logosScene = new ImageScene(gridzilla, onPaused,
    {
      period: 36000,
      perImagePeriod: 3000,
      imagesConfiguration: [
        { name: "Foley Logo 36x168.gif" },
        { name: "Enerfab Logo 36x168.gif" },
        { name: "Equipment Share Logo V1 (168x36).png" },
        { name: "Jolt Lighting Logo 36x106.gif" },
        { name: "Pretech Logo 36x168.gif" },
        { name: "KJO Logo (Dithered).png" },
        
        { name: "Foley Logo 36x168.gif" },
        { name: "Enerfab Logo 36x168.gif" },
        { name: "Equipment Share Logo V1 (168x36).png" },
        { name: "Jolt Lighting Logo 36x106.gif" },
        { name: "Pretech Logo 36x168.gif" },
        { name: "KJO Logo (Dithered).png" }
        
        // { name: "Lowes_78x36_V2.png"},
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
      period: 34 * 1000,
      headerText: "Thank you volunteers!",
      scrollText: teamMembers,
      // minimumInterval: 9 * 60 * 1000,
      color: new Color(colorNameToRgb["Pink"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Pink"]) }),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Pink"]) })
  );

  // const thankYouCompaniesScene = new ScrollingTextScene(gridzilla, null, onPaused,
  //   {
  //     //period: 4 * 60 * 1000,
  //     headerText: "Thanks!",
  //     scrollText: companies,
  //     minimumInterval: 9 * 60 * 1000,
  //     color: new Color(colorNameToRgb["Dark Red"])
  //   },
  //   Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
  //     { color: new Color(colorNameToRgb["Dark Red"]) }),
  //   Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
  //     { color: new Color(colorNameToRgb["Dark Red"]) })
  // );

  const preSeasonMessageScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      period: 20000,
      headerText: "Happy Holidays!",
      scrollText: "             "
        + "                     "
        + "The Holiday Lights show begins Thanksgiving evening.  "
        + "The elves are working hard to get the show ready.  "
        + "Please come back to see the show."
        + "                     ",
      color: new Color(colorNameToRgb["Green"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Green"]) }),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Green"]) })
  );

  // //show images
  // const preSeasonImageScene = new ImageScene(gridzilla, onPaused,
  //   {
  //     period: 10000,
  //     perImagePeriod: 9000,
  //     imagesConfiguration: [
  //       { name: "Snowman_Family_V4.png" },
  //       { name: "Snowman_Family_Girl_V1.png" },
  //       { name: "snowflake.png" },
  //       { name: "Christmas Snoopy Tree 168x36 (2021 V2).png" },
  //       { name: "Train_2021_V2.png", period: 29000 },
  //     ]
  //   });

  const donationsScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      period: 5500,
      headerText: "Happy Holidays!",
      scrollText: "             We do not request or accept donations during the show.              ",
      color: new Color(colorNameToRgb["Dark Red"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) }),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) })
  );

  const goChiefsScene = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      period: 5500,
      headerText: "Go Kansas City Chiefs!",
      scrollText: "            Go Chiefs!   Go Chiefs!   Go Chiefs!              ",
      color: new Color(colorNameToRgb["Dark Red"])
    },
    Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) }),
    Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
      { color: new Color(colorNameToRgb["Dark Red"]) })
  );

  // const goSportingScene = new ScrollingTextScene(gridzilla, null, onPaused,
  //   {
  //     period: 5000,
  //     headerText: "GO SPORTING KC!",
  //     scrollText: "            Go Sporting KC!   Go Sporting KC!   Go Sporting KC!             ",
  //     color: new Color(colorNameToRgb["Midnight Blue"])
  //   },
  //   Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
  //     { color: new Color(colorNameToRgb["Midnight Blue"]) }),
  //   Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
  //     { color: new Color(colorNameToRgb["Midnight Blue"]) })
  // );

  // const thankFrontLineWorkersScene = new ScrollingTextScene(gridzilla, null, onPaused,
  //   {
  //     period: 4*60*1000,
  //     headerText: "Thanks!",
  //     scrollText: ".        Thank you healthcare workers, first reponsders, and veterans!        .",
  //     minimumInterval: 9*60*1000,
  //     color: new Color(colorNameToRgb["Blue"])
  //   },
  //   Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
  //     { color: new Color(colorNameToRgb["Blue"]) } ),
  //   Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
  //     { color: new Color(colorNameToRgb["Blue"]) } )
  // );

  // create scenes
  const nolfWelcomeBanner = new BannerScene(gridzilla, onPaused,
    {
      line1: "Welcome to",
      line2: "Deanna Rose",
      line3: "Children's Farmstead",
      color: new Color(colorNameToRgb["Purple"]),
      period: 3000
    });

  // create scenes
  const nolfMessageScene1 = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      // imageNames: eosImageNames,
      headerText: "Night of the Living Farm",
      scrollText: "                         "
        + "      Friday and Saturday Nights "
        + " October 22, 23, 29, & 30 - "
        + " 5:30PM to 9:00PM -    "
        + " Purchase tickets online at drfarmstead.org                         ",
       color: new Color(colorNameToRgb["Orange"])
      },
      Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Orange"]) } ),
      Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Orange"]) } )
    );

  // create scenes
  const nolfMessageScene2 = new ScrollingTextScene(gridzilla, null, onPaused,
    {
      // imageNames: eosImageNames,
      headerText: "Holiday Lights",
      scrollText: "             "
       + "           The Holiday Lights show begins Thanksgiving evening.  "
       + "The elves are working hard to get the show ready.  "
       + "Please come back to see the show. "
       + "                                                 ",
       color: new Color(colorNameToRgb["Red"])
      },
      Object.assign(gridzillaDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Red"]) } ),
      Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Red"]) } )
    );

  //show NOLF images
  const nolfImageScene = new ImageScene(gridzilla, onPaused,
    {
      period: 10000,
      perImagePeriod: 9000,
      imagesConfiguration: [
        { name: "ghost.png" },
        { name: "pumpkin.png" },
        { name: "woodstock 38x38.png" },
        { name: "snowman.png" },
        { name: "snowflake.png" }
      ]
    });

  function configureNolfScenes(gridzilla) {
    scenes = [
      nolfWelcomeBanner,
      nolfMessageScene1,
      nolfMessageScene2,
      nolfImageScene,
      goChiefsScene,
      nolfImageScene
//      goSportingScene
    ];
  }

  function configureHolidayScenes(gridzilla) {

    scenes = [
      welcomeBanner, //red
      instructionsBanner, //green
      instructions2Banner, //red
      //instructions3Banner,
      instructions4Banner, //pink
      instructionsFacebook, //green
      instructionsInstagram, //red
      hashtagBanner, //green
      thanksMarkBanner, //pink
      headlightsBanner, //orange
      holidayImageScene,
      trainImageScene,
      thankYouScene,
      preLogosScene,
      logosScene,
      donationsScene,
      goChiefsScene
      // goSportingScene
      // cheersScene,
      // preSnakesBanner,
      // snakeScene,
      //thanksFrontLineYouScene
    ];

  }

  function configurePreSeasonScenes(gridzilla) {

    scenes = [
      welcomeBanner,
      preSeasonMessageScene,
      //thanksFrontLineYouScene,
      //preSeasonImageScene,
      holidayImageScene,
      trainImageScene,
      thankYouScene,
      preLogosScene,
      logosScene,
      goChiefsScene
      // goSportingScene,
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
      { sample: true, recipient: "Rachel", message: "Will you be my Valentine?", sender: "Chris", imageName: "Rose" },
      { sample: true, recipient: "Sheldon", message: "I love you", sender: "Amy", imageName: "Couple" },
      { sample: true, recipient: "Lucy", message: "Will you be my Valentine?", sender: "Charlie", imageName: "Heart" },
      { sample: true, recipient: "Everyone", message: "Live Long and Prosper", sender: "Spock", imageName: "Ghost" },
      { sample: true, recipient: "Mom", message: "Happy Valentine's Day", sender: "Kyle", imageName: "Birdy" }
    ];

    // create scenes
    const vdayWelcomeScene = new ScrollingTextScene(gridzilla, facade, onPaused,
      {
        imageNames: vDayImageNames,
        scrollText: "             "
          + " Happy Valentine's Day!    "
          + " Visit farmsteadlights.com to display your Valentine."
          + "             "
      },
      Object.assign(gridzillaDefaults.scrollSceneDefaultsNoHeader,
        { color: new Color(255, 200, 200) }),
      Object.assign(facadeDefaults.scrollSceneDefaultsNoHeader,
        { color: new Color(255, 200, 200) })
    );

    const vdayMessagesScene = new MessageScene(gridzilla, facade, onPaused, nameManager,
      {
        imageNames: vDayImageNames,
        sampleMessages: vDaySampleMessages
      },
      {},
      facadeDefaults.scrollSceneDefaultsNoHeader
    );

    scenes = [
      vdayWelcomeScene,
      vdayMessagesScene
    ];

  }

  function configureEosScenes(gridzilla, facade) {

    // const eosImageNames = [
    //   "rose 38x38.png"
    // ];

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
        { color: new Color(255, 255, 255) }),
      Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(255, 255, 255) })
    );

    scenes = [
      eosMessageScene,
      goChiefsScene
    ];

  }

  function configureFontTestScenes(gridzilla, facade) {

    // const fontTest1Scene = new BannerScene(gridzilla, onPaused,
    //   {
    //     line1: "abcdefghijklmnopqrstuvwxyz",
    //     line2: "ABCDEFGHIJKLM",
    //     line3: "NOPQRSTUVWXYZ",
    //     color: new Color(colorNameToRgb["White"]),
    //     period: 12000
    //   });

    //   const fontTest2Scene = new BannerScene(gridzilla, onPaused,
    //     {
    //       line1: "0123456789",
    //       line2: "\"'`^@#$%^&*=+-~_",
    //       line3: "()[]{}<>|\\/.,;:?!",
    //       color: new Color(colorNameToRgb["White"]),
    //       period: 12000
    //     });

    const fontTestMessageScene = new ScrollingTextScene(gridzilla, facade, onPaused,
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
        { color: new Color(colorNameToRgb["Dark Red"]) }),
      Object.assign(facadeDefaults.scrollSceneDefaultsWithHeader,
        { color: new Color(colorNameToRgb["Dark Red"]) })
    );

    scenes = [
      //fontTest1Scene,
      //fontTest2Scene,
      fontTestMessageScene
    ];

  }

  // set a default
  let show = EnvConfig.get().show;
  if (!show) {
    show = "Holiday";
  }

  if (show === "Valentine")
    configureValentineScenes(gridzilla, facade);
  else if (show === "Holiday")
    configureHolidayScenes(gridzilla);
  else if (show === "NOLF")
    configureNolfScenes(gridzilla);
  else if (show === "PreSeason")
    configurePreSeasonScenes(gridzilla);
  else if (show === "EOS")
    configureEosScenes(gridzilla, facade);
  else if (show == "fontTest")
    configureFontTestScenes(gridzilla, facade);
}


//////////////////////////////////////////////////////////////////////////////
// the "start-up" code
//////////////////////////////////////////////////////////////////////////////

const port = process.env.PORT || 8000;

EnvConfig.loadOverrides();

BitmapBuffer.initializeFonts().then(() => {
  ImageManager.initialize().then(() => {
    let gridzilla = TransformFactory.getGridzillaTransform();
    let facade = TransformFactory.getFacadeTransform();

    configureScenes(gridzilla, facade);

    startListening();
  });
});

function startListening() {

  // Socket.io initialization

  io.on("connection", function (socket) {
    console.log("Socket.io user connection: " + socket.id);

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
      const scene = scenes[sceneIndex];
      if (scene.onUserConnected) {
        scene.onUserConnected(socket);
      }
    }

    socket.on("disconnect", function (error) {
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
  server.listen(port, function () {
    console.log("Holiday Lights server listening on port " + port);
  });

  startNextScene();
}
