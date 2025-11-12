const dynamo = require('../../utils/dynamoClient');

const TABLE = process.env.SECTION_TABLE;

module.exports = async () => {
  const params = {
    TableName: TABLE
  };

  const result = await dynamo.scan(params).promise();
  return result.Items;
};
