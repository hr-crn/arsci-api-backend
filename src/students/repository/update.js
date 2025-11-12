const dynamo = require('../../utils/dynamoClient');

const TABLE = process.env.STUDENT_TABLE;

module.exports = async (username, data) => {
  const params = {
    TableName: TABLE,
    Key: { username}, // Use both partition and sort key
    UpdateExpression: 'set #firstName = :firstName, #lastName = :lastName, #middleName = :middleName, #sectionID = :sectionID, #password = :password, #sectionName = :sectionName',
    ExpressionAttributeNames: {
      '#firstName': 'firstName',
      '#lastName': 'lastName',
      '#middleName': 'middleName',
      '#sectionID': 'sectionID',
      '#password': 'password',
      '#sectionName': 'sectionName'
    },
    ExpressionAttributeValues: {
      ':firstName': data.firstName,
      ':lastName': data.lastName,
      ':middleName': data.middleName || null,
      ':sectionID': data.sectionID,
      ':password': data.password,
      ':sectionName': data.sectionName
    },
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamo.update(params).promise();
  return result.Attributes;
};