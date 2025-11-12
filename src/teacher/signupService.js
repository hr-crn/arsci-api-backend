const bcrypt = require("bcryptjs");
const { success, failure } = require("../utils/response");
const dynamo = require("../utils/dynamoClient");

const TABLE = process.env.TEACHER_TABLE;


// Sign up for Teachers

module.exports.signup = async (event) => {
  try {
    const data = JSON.parse(event.body);

    // Basic validation for required fields
    if (!data.email || !data.password || !data.firstName || !data.lastName) {
      return failure({ message: "First name, last name, email, and password are required" }, 400);
    }

    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const email = data.email.trim().toLowerCase();
    const password = data.password.trim();

    // Check for whitespace-only names
    if (!firstName || !lastName) {
      return failure({ message: "First name and last name cannot be empty" }, 400);
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return failure({ message: "Invalid email format" }, 400);
    }

    // Password strength check
    if (password.length < 8) {
      return failure({ message: "Password must be at least 8 characters" }, 400);
    }

    // Check if teacher exists
    const existingTeacher = await dynamo.get({
      TableName: TABLE,
      Key: { email }
    }).promise();

    if (existingTeacher.Item) {
      return failure({ message: "Email already exists" }, 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new teacher
    const newTeacher = {
      email,
      passwordHash: hashedPassword,
      firstName,
      lastName,
      createdAt: new Date().toISOString()
    };

    await dynamo.put({
      TableName: TABLE,
      Item: newTeacher
    }).promise();

    return success({ message: "Teacher signed up successfully!" }, 201);

  } catch (err) {
    console.error(err);
    return failure({ message: "Internal server error" }, 500);
  }
};
