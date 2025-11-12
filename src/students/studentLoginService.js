const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { success, failure } = require("../utils/response");
const dynamo = require("../utils/dynamoClient");

const TABLE = process.env.STUDENT_TABLE;
const JWT_SECRET = process.env.JWT_SECRET 


const SECTION_MODULES_TABLE = process.env.SECTION_MODULES_TABLE;

module.exports.studentLogin = async (event) => {
  try {
    const data = JSON.parse(event.body);

    if (!data.username || !data.password) {
      return failure({ message: "Username and password are required" }, 400);
    }

    const username = data.username.trim();
    const password = data.password.trim();

    const student = await dynamo.get({
      TableName: TABLE,
      Key: { username }
    }).promise();

    if (!student.Item) {
      return failure({ message: "Invalid email or password" }, 401);
    }

    // Compare passwords
    if (student.Item.password !== password) {
      return failure({ message: "Invalid email or password" }, 401);
    }

    const sectionID = student.Item.sectionID;
    if (!sectionID) {
      return failure({ message: "Student is not assigned to any section" }, 400);
    }

    // ✅ Query SectionModules table for this section

     const params = {
      TableName: SECTION_MODULES_TABLE,
      FilterExpression: "sectionID = :s",
      ExpressionAttributeValues: {
      ":s": sectionID
      }
      };

    const getModules = await dynamo.scan(params).promise();



    // ✅ Map only this student's progress inside each module
    const modulesWithProgress = getModules.Items.map((mod) => {
      const studentProgress = (mod.students || []).find(s => s.username === username);

      return {
        sectionModuleID: mod.sectionModuleID,
        moduleID: mod.moduleID,
        title: mod.title,
        unlocked: mod.unlocked,
        order: mod.order,
        progress: studentProgress
          ? {
              score: studentProgress.score || null,
              status: studentProgress.status || "not-started",
              progress: studentProgress.progress || 0
            }
          : { score: null, status: "not-started" }
      };
    });



    // Generate JWT token
    const token = jwt.sign(
      {
        username: student.Item.username
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Construct full name from components
    const fullName = [
      student.Item.firstName,
      student.Item.middleName,
      student.Item.lastName
    ].filter(Boolean).join(' ');

    return success({
      message: "Login successful",
      token,
      student: {
        username: student.Item.username,
        firstName: student.Item.firstName,
        lastName: student.Item.lastName,
        middleName: student.Item.middleName,
        name: fullName, // For backward compatibility
        sectionName: getModules.Items[0].sectionName,
        modules: modulesWithProgress
      }
    }, 200);

  } catch (err) {
    console.error(err);
    return failure({ message: "Internal server error" }, 500);
  }
};
