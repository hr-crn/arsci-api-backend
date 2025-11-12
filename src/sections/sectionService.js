const verifyAuth = require('../utils/verifyAuth');
const create = require('./repository/create');
const get = require('./repository/get');
const update = require('./repository/update');
const remove = require('./repository/delete');
const list = require('./repository/list');
const { success, failure } = require('../utils/response');
const dynamo = require("../utils/dynamoClient");
const { v4: uuidv4 } = require('uuid');


const TABLE = process.env.SECTION_TABLE;
const SECTION_MODULES_TABLE = process.env.SECTION_MODULES_TABLE;
const STUDENT_TABLE = process.env.STUDENT_TABLE;

const DEFAULT_MODULES = [
  { moduleID: "mod1", title: "Human Anatomy", unlocked: true, order: 1 },
  { moduleID: "mod2", title: "Volcano" ,unlocked: false, order: 2 },
  { moduleID: "mod3", title: "Animals" ,unlocked: false, order: 3 },
  { moduleID: "mod4", title: "Solar System",unlocked: false, order: 4 }
];

module.exports = {
  async createSection(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const data = JSON.parse(event.body);
      const sectionName = data.sectionName.trim();
      const teacherEmail = auth.decoded.username || auth.decoded.email; // support tokens with email

      if (!teacherEmail) {
        return failure({ message: "Missing teacher identity in token" }, 401);
      }

      console.log("data:", data.sectionName);

      const params = {
        TableName: TABLE,
        FilterExpression: "sectionName = :s AND teacherEmail = :t",
        ExpressionAttributeValues: {
          ":s": sectionName,
          ":t": teacherEmail,
        },
      };

      const existingSection = await dynamo.scan(params).promise();
      if (existingSection.Items.length > 0) {
        return failure({ message: "section already exists" }, 400);
      }

      // Create the section and stamp teacherEmail (soft multi-tenancy)
      const section = await create({ ...data, teacherEmail });

      // Create default modules (one by one)
      for (const mod of DEFAULT_MODULES) {
        await dynamo.put({
          TableName: SECTION_MODULES_TABLE,
          Item: {
            sectionModuleID: uuidv4(),
            moduleID: mod.moduleID,
            title: mod.title,
            unlocked: mod.unlocked,
            sectionID: section.sectionID,
            sectionName: sectionName,
            teacherEmail: teacherEmail,
            order: mod.order,
            students: [],
            createdAt: new Date().toISOString(),
          },
        }).promise();
      }

      return success(section, 201);
    } catch (err) {
      return failure(err);
    }
  },
  async getSection(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const { sectionID } = event.pathParameters;
      const section = await get(sectionID); // Pass email
      return success(section);
    } catch (err) {
      return failure(err);
    }
  },
  async updateSection(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const { sectionID } = event.pathParameters;
      const data = JSON.parse(event.body);
      const section = await update(sectionID, data); // Update section table first

      // If sectionName is provided/changed, propagate to all related module items
      if (data.sectionName && data.sectionName.trim()) {
        const newName = data.sectionName.trim();

        // Find all module items for this section
        const scanParams = {
          TableName: SECTION_MODULES_TABLE,
          FilterExpression: "sectionID = :s",
          ExpressionAttributeValues: { ":s": sectionID },
        };
        const modulesResp = await dynamo.scan(scanParams).promise();

        for (const modItem of modulesResp.Items || []) {
          await dynamo.update({
            TableName: SECTION_MODULES_TABLE,
            Key: { sectionModuleID: modItem.sectionModuleID },
            UpdateExpression: "SET sectionName = :sn",
            ExpressionAttributeValues: { ":sn": newName },
          }).promise();
        }
      }
      return success(section);
    } catch (err) {
      return failure(err);
    }
  },
  //Deleting section requires to check every student first, if section has count > 0 , cannot delete
  async deleteSection(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const { sectionID } = event.pathParameters;

      // 0) Guard: prevent delete if any students still belong to this section
      const studentScan = await dynamo.scan({
        TableName: STUDENT_TABLE,
        FilterExpression: "sectionID = :s",
        ExpressionAttributeValues: { ":s": sectionID },
      }).promise();
      if (studentScan.Items && studentScan.Items.length > 0) {
        return failure({ message: "Section has students. Please migrate or remove students before deleting." }, 400);
      }

      // 1) Remove all module items for this section to avoid orphaned records
      const scanParams = {
        TableName: SECTION_MODULES_TABLE,
        FilterExpression: "sectionID = :s",
        ExpressionAttributeValues: { ":s": sectionID },
      };
      const modulesResp = await dynamo.scan(scanParams).promise();

      for (const modItem of modulesResp.Items || []) {
        await dynamo.delete({
          TableName: SECTION_MODULES_TABLE,
          Key: { sectionModuleID: modItem.sectionModuleID },
        }).promise();
      }

      // 2) Remove the section itself
      const result = await remove(sectionID);
      return success(result);
    } catch (err) {
      return failure(err);
    }
  },
  async listSections(event) {
    const auth = verifyAuth(event);
    console.log('auth:', auth)
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const teacherEmail = auth.decoded && (auth.decoded.username || auth.decoded.email);
      if (!teacherEmail) {
        return success([]);
      }
      const includeArchived = event.queryStringParameters && (event.queryStringParameters.includeArchived === 'true');

      const scanParams = includeArchived
        ? {
            TableName: TABLE,
            FilterExpression: "teacherEmail = :t",
            ExpressionAttributeValues: { ":t": teacherEmail },
          }
        : {
            TableName: TABLE,
            FilterExpression: "teacherEmail = :t AND (attribute_not_exists(archived) OR archived = :f)",
            ExpressionAttributeValues: { ":t": teacherEmail, ":f": false },
          };

      const resp = await dynamo.scan(scanParams).promise();
      const sections = resp.Items || [];
      return success(sections);
    } catch (err) {
      return failure(err);
    }
  }
};
