/**
 * Standard ApiResponse helper matching the Spring Boot ApiResponse<T> contract.
 */
export class ApiResponse {
  /**
   * Send a successful response envelope.
   * @param {import('express').Response} res
   * @param {*} [data={}] Response payload
   * @param {string} [message='Operation successful'] Human-readable success message
   * @param {number} [statusCode=200] HTTP status code
   */
  static success(res, data = {}, message = 'Operation successful', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a 201 Created response envelope.
   * @param {import('express').Response} res
   * @param {*} [data={}] Response payload
   * @param {string} [message='Resource created successfully']
   */
  static created(res, data = {}, message = 'Resource created successfully') {
    return this.success(res, data, message, 201);
  }

  /**
   * Send an error response envelope.
   * @param {import('express').Response} res
   * @param {Object} options
   * @param {string} [options.message='An error occurred']
   * @param {number} [options.statusCode=500]
   * @param {string} [options.errorCode='INTERNAL_SERVER_ERROR']
   * @param {Object|Array|null} [options.errors=null]
   * @param {string} [options.path='']
   * @param {string} [options.requestId='']
   */
  static error(res, {
    message = 'An error occurred',
    statusCode = 500,
    errorCode = 'INTERNAL_SERVER_ERROR',
    errors = null,
    path = '',
    requestId = '',
  } = {}) {
    const payload = {
      success: false,
      status: statusCode,
      message,
      errorCode,
      timestamp: new Date().toISOString(),
    };

    if (errors) {
      payload.errors = errors;
    }

    if (path) {
      payload.path = path;
    }

    if (requestId) {
      payload.requestId = requestId;
    }

    return res.status(statusCode).json(payload);
  }

  /**
   * Send a paginated response envelope matching Spring Data Page<T>.
   * @param {import('express').Response} res
   * @param {Object} options
   * @param {Array} options.content
   * @param {number} options.page
   * @param {number} options.size
   * @param {number} options.totalElements
   * @param {string} [options.message='Data retrieved successfully']
   */
  static paged(res, {
    content = [],
    page = 0,
    size = 10,
    totalElements = 0,
    message = 'Data retrieved successfully',
  }) {
    const totalPages = Math.ceil(totalElements / (size || 1));
    const last = page >= totalPages - 1;

    return res.status(200).json({
      success: true,
      message,
      data: {
        content,
        page,
        size,
        totalElements,
        totalPages,
        last,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export default ApiResponse;
