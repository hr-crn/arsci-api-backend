const dynamo = require('../../utils/dynamoClient');
const SECTION_MODULES_TABLE = process.env.SECTION_MODULES_TABLE;

/**
 * Get quiz results by sectionID + moduleID
 * Returns: { sectionID, moduleID, title, sectionName, results }
 */
module.exports = async (sectionID, moduleID, teacherEmail) => {
  // Step 1: Query/Scan item (since PK is sectionModuleID)
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

  // Soft multi-tenancy: prefer item with matching teacherEmail; allow legacy (no teacherEmail)
  const item = result.Items.find(it => !teacherEmail || !it.teacherEmail || it.teacherEmail === teacherEmail);
  if (!item) {
    throw new Error("Module not accessible for this teacher");
  }

  // Step 2: Transform students into a clean results array
  const results = (Array.isArray(item.students) ? item.students : []).map((s) => {
    if (!s.score && s.status === "not-started") {
      return {
        username: s.username,
        firstName: s.firstName || "",
        middleName: s.middleName || "",
        lastName: s.lastName || "",
        name: s.name,
        status: "not-started",
        progress: s.progress,
        progressCompleted: s.progressCompleted,
        updatedAt: s.scoreTimestamp || null
      };
    }

    return {
      username: s.username,
      firstName: s.firstName || "",
      middleName: s.middleName || "",
      lastName: s.lastName || "",
      name: s.name,
      score: s.score,
      status: "completed",
      progress: s.progress,
      progressCompleted: s.progressCompleted,
      updatedAt: s.scoreTimestamp || null
    };
  });

  // Step 3: Return clean response
  return {
    sectionID: item.sectionID,
    moduleID: item.moduleID,
    title: item.title,
    sectionName: item.sectionName,
    results,
  };
};