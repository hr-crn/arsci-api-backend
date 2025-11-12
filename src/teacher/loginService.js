const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { success, failure } = require("../utils/response");
const dynamo = require("../utils/dynamoClient");

const TABLE = process.env.TEACHER_TABLE;
const JWT_SECRET = process.env.JWT_SECRET 

module.exports.login = async (event) => {
  try {
    const data = JSON.parse(event.body);

    if (!data.email || !data.password) {
      return failure({ message: "Email and password are required" }, 400);
    }

    const email = data.email.trim().toLowerCase();
    const password = data.password.trim();

    // Get teacher from DB
    const teacher = await dynamo.get({
      TableName: TABLE,
      Key: { email }
    }).promise();

    if (!teacher.Item) {
      return failure({ message: "Invalid email or password" }, 401);
    }

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, teacher.Item.passwordHash);
    if (!passwordMatch) {
      return failure({ message: "Invalid email or password" }, 401);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        email: teacher.Item.email,
        firstName: teacher.Item.firstName,
        lastName: teacher.Item.lastName
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return success({
      message: "Login successful",
      token,
      teacher: {
        email: teacher.Item.email,
        firstName: teacher.Item.firstName,
        lastName: teacher.Item.lastName
      }
    }, 200);

  } catch (err) {
    console.error(err);
    return failure({ message: "Internal server error" }, 500);
  }
};
