const dynamo = require('../../utils/dynamoClient');

const TABLE = process.env.SECTION_TABLE;

module.exports = async (sectionID) => {
  console.log("Deleting section:",sectionID);
  const params = {
    TableName: TABLE,
    Key: { sectionID } // Use both partition and sort key
  };

  await dynamo.delete(params).promise();
  return { message: `Section ${sectionID} deleted.` };
};
