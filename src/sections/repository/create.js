const dynamo = require('../../utils/dynamoClient');
const { v4: uuidv4 } = require('uuid');
const TABLE = process.env.SECTION_TABLE;

module.exports = async function createSection(data) {
  const item = {
    sectionID: uuidv4(),
    sectionName: data.sectionName,
    teacherEmail: data.teacherEmail,
    createdAt: new Date().toISOString()
  };

  await dynamo.put({ TableName: TABLE, Item: item }).promise();
  return item;
};