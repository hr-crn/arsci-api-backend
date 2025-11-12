const dynamo = require('../../utils/dynamoClient');

const TABLE = process.env.TEACHER_TABLE;

module.exports = async (email, data) => {
  const fields = [];
  const names = {};
  const values = {};

  if (data.firstName !== undefined) {
    fields.push('#firstName = :firstName');
    names['#firstName'] = 'firstName';
    values[':firstName'] = data.firstName;
  }
  if (data.lastName !== undefined) {
    fields.push('#lastName = :lastName');
    names['#lastName'] = 'lastName';
    values[':lastName'] = data.lastName;
  }
  if (data.passwordHash !== undefined) {
    fields.push('#passwordHash = :passwordHash');
    names['#passwordHash'] = 'passwordHash';
    values[':passwordHash'] = data.passwordHash;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  const params = {
    TableName: TABLE,
    Key: { email },
    UpdateExpression: 'set ' + fields.join(', '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamo.update(params).promise();
  return result.Attributes;
};