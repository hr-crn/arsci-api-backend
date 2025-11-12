const dynamo = require('../../utils/dynamoClient');
const { v4: uuidv4 } = require('uuid');
const TABLE = process.env.STUDENT_TABLE;

module.exports = async function createStudent(data) {
  const item = {          // Partition key: teacher's email
    firstName: data.firstName,
    lastName: data.lastName,
    middleName: data.middleName || null,
    sectionID: data.sectionID,
    username: data.username,
    password: data.password,
    sectionName: data.sectionName,
    teacherEmail: data.teacherEmail,
    createdAt: new Date().toISOString()
  };

  await dynamo.put({ TableName: TABLE, Item: item }).promise();
  return item;
};