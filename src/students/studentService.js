const verifyAuth = require('../utils/verifyAuth');
const create = require('./repository/create');
const get = require('./repository/get');
const update = require('./repository/update');
const remove = require('./repository/delete');
const list = require('./repository/list');
const { success, failure } = require('../utils/response');
const bcrypt = require('bcryptjs');
const TABLE = process.env.STUDENT_TABLE;
const dynamo = require("../utils/dynamoClient");

const SECTION_MODULES_TABLE = process.env.SECTION_MODULES_TABLE;
const SECTION_TABLE = process.env.SECTION_TABLE;

module.exports = {
  async createStudent(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);

    try {
      const data = JSON.parse(event.body);
      const teacherEmail = auth.decoded.username || auth.decoded.email; // support tokens with email

      // Required fields
      if (!data.username || !data.password || !data.firstName || !data.lastName || !data.sectionID) {
        return failure(
          { message: "firstName, lastName, username, sectionID and password are required" },
          400
        );
      }

      const firstName = data.firstName.trim();
      const lastName = data.lastName.trim();
      const middleName = data.middleName ? data.middleName.trim() : null;
      const username = data.username.trim().toLowerCase();
      const password = data.password.trim();
      const sectionID = data.sectionID.trim();

      // Prevent empty/whitespace names
      if (!firstName || !lastName) {
        return failure(
          { message: "First name and last name cannot be empty" },
          400
        );
      }


      // Password strength validation
      if (password.length < 8) {
        return failure({ message: "Password must be at least 8 characters" }, 400);
      }

      // Check if username exists
      const existingUsername = await dynamo.get({
        TableName: TABLE,
        Key: { username }
      }).promise();

      if (existingUsername.Item) {
       return failure({ message: "Username already exists" }, 400);
      }

        // Go to section module table and save this student
      // Now update SectionModulesTable: push student to every module in this section

      const params = {
      TableName: SECTION_MODULES_TABLE,
      FilterExpression: "sectionID = :s",
      ExpressionAttributeValues: {
      ":s": sectionID
      }
      };

      const sectionModule = await dynamo.scan(params).promise();

      if (sectionModule.Items.length < 1) {
        return failure({ message: "sectionID not existing in section-module table" }, 400);
      }

      for (const module of sectionModule.Items) {
        await dynamo.update({
          TableName: SECTION_MODULES_TABLE,
          Key: {
            sectionModuleID: module.sectionModuleID
          },
          UpdateExpression: "SET students = list_append(if_not_exists(students, :empty), :s)",
          ExpressionAttributeValues: {
            ":s": [
              {
                username: username, // or uuid if you generate one
                firstName,
                lastName,
                middleName,
                score: null,
                status: "not-started",
                progress: 0,
                progressCompleted: null
              },
            ],
            ":empty": [],
          },
        }).promise();
      }

          // Prepare new student record
      const studentData = {
        ...data,
        username, // store validated/normalized email
        password,
        firstName,
        lastName,
        middleName,
        sectionID,
        sectionName: sectionModule.Items[0].sectionName,
        teacherEmail,
        createdAt: new Date().toISOString(),
      };

      const student = await create(studentData);
      return success(student, 201);

    } catch (err) {
      console.error("Error creating student:", err);
      return failure({ message: "Internal server error" }, 500);
    }
  },
  async getStudent(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const { username } = event.pathParameters;
      console.log("username: ",username);
      const student = await get(username); // Pass email
      return success(student);
    } catch (err) {
      return failure(err);
    }
  },
  async updateStudent(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const { username } = event.pathParameters;
      const data = JSON.parse(event.body);

      // Load existing student to detect section changes
      const existing = await get(username);
      const prevSectionID = existing?.sectionID;
      const newSectionID = (data.sectionID || prevSectionID || '').trim();

      // If section changed, migrate roster entries across section-modules
      if (prevSectionID && newSectionID && prevSectionID !== newSectionID) {
        // 1) Read previous section's modules and capture any existing scores/status
        const scanOld = {
          TableName: SECTION_MODULES_TABLE,
          FilterExpression: "sectionID = :s",
          ExpressionAttributeValues: { ":s": prevSectionID },
        };
        const oldMods = await dynamo.scan(scanOld).promise();

        // Map of moduleID -> { score, status } for this username (if any)
        const oldProgressByModule = new Map();
        for (const modItem of oldMods.Items || []) {
          const found = (Array.isArray(modItem.students) ? modItem.students : []).find(
            (s) => s && s.username === username
          );
          if (found) {
            oldProgressByModule.set(modItem.moduleID, {
              score: found.score ?? null,
              status: found.status ?? "not-started",
            });
          }
        }

        // 2) Remove from previous section's modules
        for (const modItem of oldMods.Items || []) {
          const currentStudents = Array.isArray(modItem.students) ? modItem.students : [];
          const filtered = currentStudents.filter((s) => s && s.username !== username);
          if (filtered.length !== currentStudents.length) {
            await dynamo.update({
              TableName: SECTION_MODULES_TABLE,
              Key: { sectionModuleID: modItem.sectionModuleID },
              UpdateExpression: "SET students = :students",
              ExpressionAttributeValues: { ":students": filtered },
            }).promise();
          }
        }

        // 3) Add to new section's modules (carrying over any captured score/status per moduleID)
        const scanNew = {
          TableName: SECTION_MODULES_TABLE,
          FilterExpression: "sectionID = :s",
          ExpressionAttributeValues: { ":s": newSectionID },
        };
        const newMods = await dynamo.scan(scanNew).promise();

        if (!newMods.Items || newMods.Items.length === 0) {
          return failure({ message: "new sectionID not existing in section-module table" }, 400);
        }

        const firstNameToUse = (data.firstName ? data.firstName.trim() : existing?.firstName) || '';
        const lastNameToUse = (data.lastName ? data.lastName.trim() : existing?.lastName) || '';
        const middleNameToUse = data.middleName ? data.middleName.trim() : (existing?.middleName || null);
        for (const modItem of newMods.Items) {
          const carry = oldProgressByModule.get(modItem.moduleID) || { score: null, status: "not-started" };
          await dynamo.update({
            TableName: SECTION_MODULES_TABLE,
            Key: { sectionModuleID: modItem.sectionModuleID },
            UpdateExpression: "SET students = list_append(if_not_exists(students, :empty), :s)",
            ExpressionAttributeValues: {
              ":s": [
                { username, firstName: firstNameToUse, lastName: lastNameToUse, middleName: middleNameToUse, score: carry.score, status: carry.status },
              ],
              ":empty": [],
            },
          }).promise();
        }

        // 4) Ensure student record carries updated sectionName from the new section modules
        data.sectionName = newMods.Items[0].sectionName;
        data.sectionID = newSectionID; // normalized
      }

      // Ensure required fields are present to avoid writing undefined
      if (data.firstName === undefined) data.firstName = existing?.firstName;
      if (data.lastName === undefined) data.lastName = existing?.lastName;
      if (data.middleName === undefined) data.middleName = existing?.middleName || null;
      if (data.password === undefined) data.password = existing?.password;
      if (data.sectionID === undefined) data.sectionID = existing?.sectionID;
      if (data.sectionName === undefined) data.sectionName = existing?.sectionName;

      const student = await update(username, data); // Save changes
      return success(student);
    } catch (err) {
      return failure(err);
    }
  },
  async deleteStudent(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const { username } = event.pathParameters;

      // 1) Get the student first to know their sectionID (needed to clean module rosters)
      const existing = await get(username);

      if (existing && existing.sectionID) {
        const sectionID = existing.sectionID;

        // 2) Find all module items for this section
        const scanParams = {
          TableName: SECTION_MODULES_TABLE,
          FilterExpression: "sectionID = :s",
          ExpressionAttributeValues: {
            ":s": sectionID,
          },
        };

        const modulesResp = await dynamo.scan(scanParams).promise();

        // 3) For each module item, remove the student from students[] if present
        for (const modItem of modulesResp.Items || []) {
          const currentStudents = Array.isArray(modItem.students) ? modItem.students : [];
          const filtered = currentStudents.filter((s) => s && s.username !== username);

          // Only update if something actually changed
          if (filtered.length !== currentStudents.length) {
            await dynamo
              .update({
                TableName: SECTION_MODULES_TABLE,
                Key: { sectionModuleID: modItem.sectionModuleID },
                UpdateExpression: "SET students = :students",
                ExpressionAttributeValues: {
                  ":students": filtered,
                },
              })
              .promise();
          }
        }
      }

      // 4) Finally, remove the student record itself
      const result = await remove(username);
      return success(result);
    } catch (err) {
      return failure(err);
    }
  },
  async listStudents(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const teacherEmail = auth.decoded && (auth.decoded.username || auth.decoded.email);
      if (!teacherEmail) {
        return success([]);
      }

      const includeArchived =
        event.queryStringParameters && event.queryStringParameters.includeArchived === 'true';

      // Get all students for this teacher
      const scanParams = {
        TableName: TABLE,
        FilterExpression: "teacherEmail = :t",
        ExpressionAttributeValues: { ":t": teacherEmail },
      };
      const resp = await dynamo.scan(scanParams).promise();
      let students = resp.Items || [];

      if (includeArchived) {
        // Show only assigned students (hide unassigned) regardless of archived state
        students = students.filter((s) => !!s.sectionID);
      } else {
        // Fetch only non-archived sections for this teacher
        const secResp = await dynamo.scan({
          TableName: SECTION_TABLE,
          FilterExpression:
            "teacherEmail = :t AND (attribute_not_exists(archived) OR archived = :f)",
          ExpressionAttributeValues: { ":t": teacherEmail, ":f": false },
        }).promise();
        const activeSectionIds = new Set((secResp.Items || []).map((s) => s.sectionID));

        // Keep only students assigned to active sections (hide unassigned)
        students = students.filter((s) => s.sectionID && activeSectionIds.has(s.sectionID));
      }

      return success(students);
    } catch (err) {
      return failure(err);
    }
  },

  // Restore migrateStudents endpoint
  async migrateStudents(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const teacherEmail = auth.decoded && (auth.decoded.username || auth.decoded.email);
      if (!teacherEmail) return failure({ message: "Missing teacher identity in token" }, 401);

      const body = JSON.parse(event.body || '{}');
      const fromSectionID = (body.fromSectionID || '').trim();
      const toSectionID = (body.toSectionID || '').trim();

      if (!fromSectionID || !toSectionID) {
        return failure({ message: "fromSectionID and toSectionID are required" }, 400);
      }
      if (fromSectionID === toSectionID) {
        return failure({ message: "fromSectionID and toSectionID must be different" }, 400);
      }

      // Get all students in the fromSection for this teacher
      const scanStudents = {
        TableName: TABLE,
        FilterExpression: "sectionID = :s AND teacherEmail = :t",
        ExpressionAttributeValues: { ":s": fromSectionID, ":t": teacherEmail },
      };
      const studentsResp = await dynamo.scan(scanStudents).promise();
      const students = studentsResp.Items || [];

      // Fetch modules once for both sections
      const oldModsResp = await dynamo.scan({
        TableName: SECTION_MODULES_TABLE,
        FilterExpression: "sectionID = :s",
        ExpressionAttributeValues: { ":s": fromSectionID },
      }).promise();
      const oldMods = oldModsResp.Items || [];

      const newModsResp = await dynamo.scan({
        TableName: SECTION_MODULES_TABLE,
        FilterExpression: "sectionID = :s",
        ExpressionAttributeValues: { ":s": toSectionID },
      }).promise();
      const newMods = newModsResp.Items || [];
      if (newMods.length === 0) {
        return failure({ message: "toSectionID not existing in section-module table" }, 400);
      }

      let migrated = 0;
      const errors = [];

      for (const st of students) {
        const username = st.username;
        const firstNameToUse = st.firstName || '';
        const lastNameToUse = st.lastName || '';
        const middleNameToUse = st.middleName || null;

        try {
          // Build carryover map for this student from oldMods
          const carryByModule = new Map();
          for (const modItem of oldMods) {
            const found = (Array.isArray(modItem.students) ? modItem.students : []).find((s) => s && s.username === username);
            if (found) {
              carryByModule.set(modItem.moduleID, {
                score: found.score ?? null,
                status: found.status ?? "not-started",
              });
            }
          }

          // Remove from old section's modules
          for (const modItem of oldMods) {
            const currentStudents = Array.isArray(modItem.students) ? modItem.students : [];
            const filtered = currentStudents.filter((s) => s && s.username !== username);
            if (filtered.length !== currentStudents.length) {
              await dynamo.update({
                TableName: SECTION_MODULES_TABLE,
                Key: { sectionModuleID: modItem.sectionModuleID },
                UpdateExpression: "SET students = :students",
                ExpressionAttributeValues: { ":students": filtered },
              }).promise();
            }
          }

          // Add to new section's modules
          for (const modItem of newMods) {
            const carry = carryByModule.get(modItem.moduleID) || { score: null, status: "not-started" };
            await dynamo.update({
              TableName: SECTION_MODULES_TABLE,
              Key: { sectionModuleID: modItem.sectionModuleID },
              UpdateExpression: "SET students = list_append(if_not_exists(students, :empty), :s)",
              ExpressionAttributeValues: {
                ":s": [ { username, firstName: firstNameToUse, lastName: lastNameToUse, middleName: middleNameToUse, score: carry.score, status: carry.status } ],
                ":empty": [],
              },
            }).promise();
          }

          // Update the student record's sectionID and sectionName
          await update(username, {
            sectionID: toSectionID,
            sectionName: newMods[0].sectionName,
          });

          migrated += 1;
        } catch (e) {
          errors.push({ username, error: e.message || String(e) });
        }
      }

      return success({ migrated, failed: errors.length, errors });
    } catch (err) {
      return failure(err);
    }
  }
};
