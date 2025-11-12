const dynamo = require('../../utils/dynamoClient');

const TABLE = process.env.STUDENT_TABLE;

module.exports = async (username) => {
  const params = {
    TableName: TABLE,
    Key: { username} // Use both partition and sort key
  };

  const result = await dynamo.get(params).promise();
  return result.Item;
};