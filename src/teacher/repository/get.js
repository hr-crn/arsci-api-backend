const dynamo = require('../../utils/dynamoClient');

const TABLE = process.env.TEACHER_TABLE;

module.exports = async (email) => {
  const params = {
    TableName: TABLE,
    Key: { email }
  };

  const result = await dynamo.get(params).promise();
  return result.Item;
};
