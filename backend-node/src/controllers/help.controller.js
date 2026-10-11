import { HelpService } from '../services/help.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class HelpController {
  static async getHelp(req, res) {
    const { search, category } = req.query;
    const data = await HelpService.getHelpOverview(search, category);
    return ApiResponse.success(res, data);
  }

  static async getFaqs(req, res) {
    const { search, category } = req.query;
    const faqs = await HelpService.getFaqs(search, category);
    return ApiResponse.success(res, faqs);
  }

  static async saveFaq(req, res) {
    const { id } = req.params;
    const faq = await HelpService.saveFaq(id, req.body);
    return ApiResponse.success(res, faq, id ? 'FAQ updated' : 'FAQ saved', id ? 200 : 201);
  }

  static async getVideos(req, res) {
    const videos = await HelpService.getVideos();
    return ApiResponse.success(res, videos);
  }

  static async saveVideo(req, res) {
    const { id } = req.params;
    const video = await HelpService.saveVideo(id, req.body);
    return ApiResponse.success(res, video, id ? 'Tutorial video updated' : 'Tutorial video saved', id ? 200 : 201);
  }

  static async deleteVideo(req, res) {
    const { id } = req.params;
    await HelpService.deleteVideo(id);
    return ApiResponse.success(res, null, 'Tutorial video deleted');
  }
}

export default HelpController;
