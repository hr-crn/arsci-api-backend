// For Modules and Quiz

const verifyAuth = require('../utils/verifyAuth');
const { success, failure } = require('../utils/response');
const dynamo = require("../utils/dynamoClient");
const { v4: uuidv4 } = require('uuid');
const getStudent = require('./repository/getStudent');
const updateQuizByUsername = require('./repository/updateQuizByUsername');
const updateProgressByUsername = require('./repository/updateProgressByUsername');
const getQuizResultsBySection = require('./repository/getQuizResultsBySection');

const SECTION_MODULES_TABLE = process.env.SECTION_MODULES_TABLE;
const SECTION_TABLE = process.env.SECTION_TABLE;

module.exports = {
  async updateQuiz(event) {
    try {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);

    const username = auth.decoded.username;

    console.log("Username from token:", username);


    const data = JSON.parse(event.body);

    const validModuleIds = ["mod1", "mod2", "mod3", "mod4"];

    if (!data.moduleID || !validModuleIds.includes(data.moduleID)) {
      return failure({ message: "moduleID should be valid" }, 400);
    }

    if (
      data.score === undefined || 
      data.score === null || 
      !Number.isInteger(data.score)
    ) {
      return failure({ message: "score must be a non-empty integer" }, 400);
    }

  

    const student = await getStudent(username);
    const moduleID = data.moduleID;
    const sectionID = student.sectionID;
    const score = data.score;

    const updateQuiz = await updateQuizByUsername(username,sectionID,moduleID,score);

    console.log(updateQuiz);

    return success({
      message: "Success",
      username: username,
      moduleID: moduleID,
      sectionID: sectionID,
      score: score
    }, 200);

  } catch (err) {
    console.error(err);
    return failure({ message: "Internal server error" }, 500);
  }
  },
  //Get Quiz Result by Section
  async getQuizResult(event) {
    try {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);

    const { sectionID, moduleID } = event.queryStringParameters;
    const teacherEmail = auth.decoded.username;


    const validModuleIds = ["mod1", "mod2", "mod3", "mod4"];

    if (!moduleID || !validModuleIds.includes(moduleID)) {
      return failure({ message: "moduleID should be valid" }, 400);
    }

    if (
      sectionID === undefined 
    ) {
      return failure({ message: "put sectionID" }, 400);
    }


      const quizResult = await getQuizResultsBySection(sectionID, moduleID, teacherEmail);
      return success(quizResult);
    } catch (err) {
      return failure(err);
    }
  },
  async updateProgress(event) {
    try {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);

    const username = auth.decoded.username;

    console.log("Username from token:", username);


    const data = JSON.parse(event.body);

    const validModuleIds = ["mod1", "mod2", "mod3", "mod4"];

    if (!data.moduleID || !validModuleIds.includes(data.moduleID)) {
      return failure({ message: "moduleID should be valid" }, 400);
    }

    if (
      data.progress === undefined || 
      data.progress === null || 
      !Number.isInteger(data.progress)
    ) {
      return failure({ message: "progress must be a non-empty integer" }, 400);
    }

  

    const student = await getStudent(username);
    const moduleID = data.moduleID;
    const sectionID = student.sectionID;
    const progress = data.progress;
    var progressCompleted =  "Not Completed Yet"

    if(progress === 100){
      progressCompleted =  new Date().toISOString().split('T')[0];

    }
    



    const updateProgress = await updateProgressByUsername(username,sectionID,moduleID,progress,progressCompleted);


    return success({
      message: "Success",
      username: username,
      moduleID: moduleID,
      sectionID: sectionID,
      progress: progress,
      progressCompleted: progressCompleted
    }, 200);

  } catch (err) {
    console.error(err);
    return failure({ message: "Internal server error" }, 500);
  }
  }
};
