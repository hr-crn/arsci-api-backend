const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { success, failure } = require('../utils/response');
const dynamo = require('../utils/dynamoClient');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const TEACHER_TABLE = process.env.TEACHER_TABLE;

const client = new OAuth2Client(CLIENT_ID);

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const idToken = body.idToken || body.credential;
    if (!idToken) return failure({ message: 'Missing idToken' }, 400);
    if (!CLIENT_ID) return failure({ message: 'Server missing GOOGLE_CLIENT_ID' }, 500);

    const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub, email, name, picture, given_name, family_name, email_verified } = payload || {};
    if (!sub || !email) return failure({ message: 'Invalid Google token' }, 401);

    // Derive first/last names with fallbacks
    let firstName = given_name || '';
    let lastName = family_name || '';
    if ((!firstName || !lastName) && name) {
      const parts = String(name).trim().split(/\s+/);
      if (!firstName && parts.length) firstName = parts[0];
      if (!lastName && parts.length > 1) lastName = parts.slice(1).join(' ');
    }

    const token = jwt.sign({ email, sub }, JWT_SECRET, { expiresIn: '1h' });

    // Upsert teacher profile in DynamoDB (idempotent)
    if (TEACHER_TABLE) {
      const now = new Date().toISOString();
      const params = {
        TableName: TEACHER_TABLE,
        Key: { email },
        UpdateExpression:
          'SET #firstName = :firstName, #lastName = :lastName, #name = :name, #picture = :picture, ' +
          '#emailVerified = :emailVerified, #sub = :sub, #googleLinked = :googleLinked, ' +
          '#lastLoginAt = :lastLoginAt, #createdAt = if_not_exists(#createdAt, :createdAt)',
        ExpressionAttributeNames: {
          '#firstName': 'firstName',
          '#lastName': 'lastName',
          '#name': 'name',
          '#picture': 'picture',
          '#emailVerified': 'emailVerified',
          '#sub': 'sub',
          '#googleLinked': 'googleLinked',
          '#lastLoginAt': 'lastLoginAt',
          '#createdAt': 'createdAt'
        },
        ExpressionAttributeValues: {
          ':firstName': firstName || null,
          ':lastName': lastName || null,
          ':name': name || email,
          ':picture': picture || null,
          ':emailVerified': !!email_verified,
          ':sub': sub,
          ':googleLinked': true,
          ':lastLoginAt': now,
          ':createdAt': now
        },
        ReturnValues: 'ALL_NEW'
      };

      try {
        await dynamo.update(params).promise();
      } catch (e) {
        console.error('Failed to upsert teacher profile', e);
        // proceed without failing login
      }
    }

    return success({
      message: 'Google login successful',
      token,
      teacher: {
        email,
        name: name || email,
        firstName: firstName || null,
        lastName: lastName || null,
        profilePicture: picture || null,
        emailVerified: !!email_verified
      }
    }, 200);
  } catch (err) {
    console.error(err);
    return failure({ message: 'Google auth failed' }, 401);
  }
};
