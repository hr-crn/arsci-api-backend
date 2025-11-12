const dynamo = require('../../utils/dynamoClient');

const SECTION_MODULES_TABLE = process.env.SECTION_MODULES_TABLE;

/**
 * Update student's score/status inside students[] for given sectionID + moduleID + username
 */
module.exports = async (username, sectionID, moduleID, newScore) => {
  // Step 1: Query/Scan item since PK is sectionModuleID
  const params = {
    TableName: SECTION_MODULES_TABLE,
    FilterExpression: "sectionID = :sid AND moduleID = :mid",
    ExpressionAttributeValues: {
      ":sid": sectionID,
      ":mid": moduleID,
    },
  };

  const result = await dynamo.scan(params).promise();
  if (!result.Items || result.Items.length === 0) {
    throw new Error("No matching module found for given sectionID + moduleID");
  }

  const item = result.Items[0]; // should be unique
  const sectionModuleID = item.sectionModuleID;

  // Step 2: Find index of student inside students[]
  const studentIndex = item.students.findIndex(s => s.username === username);
  if (studentIndex === -1) {
    throw new Error("Student not found in module");
  }

  // Step 3: Update student's score
 const updateParams = {
  TableName: SECTION_MODULES_TABLE,
  Key: { sectionModuleID },
  UpdateExpression: `SET students[${studentIndex}].score = :s, students[${studentIndex}].#st = :st, students[${studentIndex}].scoreTimestamp = :ts`,
  ExpressionAttributeNames: {
    "#st": "status", // 👈 alias for reserved keyword
  },
  ExpressionAttributeValues: {
    ":s": newScore,
    ":st": "completed", // or whatever status you need
    ":ts": new Date().toISOString(),
  },
  ReturnValues: "ALL_NEW",
};

const updated = await dynamo.update(updateParams).promise();
return updated.Attributes;
};