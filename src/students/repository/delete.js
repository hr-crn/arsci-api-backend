const dynamo = require('../../utils/dynamoClient');

const TABLE = process.env.STUDENT_TABLE;

module.exports = async (username) => {
  console.log("Deleting student:", username);
  const params = {
    TableName: TABLE,
    Key: { username } // Use both partition and sort key
  };

  await dynamo.delete(params).promise();
  return { message: `Student ${username} deleted` };
};
