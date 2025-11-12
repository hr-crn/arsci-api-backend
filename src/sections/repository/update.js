const dynamo = require('../../utils/dynamoClient');

const TABLE = process.env.SECTION_TABLE;

module.exports = async (sectionID, data) => {
  // Build dynamic update for fields we allow: sectionName, archived
  const setParts = [];
  const names = {};
  const values = {};

  if (data.sectionName !== undefined) {
    setParts.push('#sectionName = :sectionName');
    names['#sectionName'] = 'sectionName';
    values[':sectionName'] = data.sectionName;
  }
  if (data.archived !== undefined) {
    setParts.push('#archived = :archived');
    names['#archived'] = 'archived';
    values[':archived'] = !!data.archived;
  }

  if (setParts.length === 0) {
    throw new Error('No updatable fields provided');
  }

  const params = {
    TableName: TABLE,
    Key: { sectionID },
    UpdateExpression: 'SET ' + setParts.join(', '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW',
  };

  const result = await dynamo.update(params).promise();
  return result.Attributes;
};