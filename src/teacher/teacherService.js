
const verifyAuth = require('../utils/verifyAuth');
const get = require('./repository/get');
const update = require('./repository/update');
const bcrypt = require('bcryptjs');
const { success, failure } = require('../utils/response');

module.exports = {
  async getTeacher(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const { email } = event.pathParameters;
      const teacher = await get(email);
      return success(teacher);
    } catch (err) {
      return failure(err);
    }
  },
  async updateTeacher(event) {
    const auth = verifyAuth(event);
    if (!auth.valid) return failure({ message: auth.message }, 401);
    try {
      const { email } = event.pathParameters;
      const data = JSON.parse(event.body);
      // Hash password if present
      if (data.password) {
        data.passwordHash = await bcrypt.hash(data.password, 10);
        delete data.password;
      }
      const teacher = await update(email, data);
      return success(teacher);
    } catch (err) {
      return failure(err);
    }
  }
};
