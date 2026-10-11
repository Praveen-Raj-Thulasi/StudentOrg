import Faq from '../models/Faq.js';
import TutorialVideo from '../models/TutorialVideo.js';
import { NotFoundError } from '../utils/errors.js';

export class HelpService {
  static async getHelpOverview(search = '', category = '') {
    const [faqs, videos] = await Promise.all([
      this.getFaqs(search, category),
      this.getVideos(),
    ]);

    return {
      faqs,
      videos,
      contactSupport: {
        email: 'support@eventbooking.local',
        hours: 'Mon-Fri 09:00-18:00',
      },
    };
  }

  static async getFaqs(search = '', category = '') {
    const query = { active: true };
    if (category) {
      query.category = { $regex: new RegExp(`^${category}$`, 'i') };
    }
    if (search) {
      query.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } },
      ];
    }
    return Faq.find(query).sort({ id: 1 }).lean();
  }

  static async saveFaq(id, data) {
    if (id) {
      const faq = await Faq.findOne({ id: Number(id) });
      if (!faq) throw new NotFoundError('FAQ not found');
      if (data.category !== undefined) faq.category = data.category;
      if (data.question !== undefined) faq.question = data.question;
      if (data.answer !== undefined) faq.answer = data.answer;
      if (data.active !== undefined) faq.active = data.active;
      await faq.save();
      return faq;
    } else {
      const faq = new Faq({
        category: data.category,
        question: data.question,
        answer: data.answer,
        active: data.active !== undefined ? data.active : true,
      });
      await faq.save();
      return faq;
    }
  }

  static async getVideos() {
    return TutorialVideo.find({ active: true }).sort({ id: 1 }).lean();
  }

  static async saveVideo(id, data) {
    if (id) {
      const video = await TutorialVideo.findOne({ id: Number(id) });
      if (!video) throw new NotFoundError('Tutorial video not found');
      if (data.title !== undefined) video.title = data.title;
      if (data.description !== undefined) video.description = data.description;
      if (data.videoUrl !== undefined) video.videoUrl = data.videoUrl;
      if (data.category !== undefined) video.category = data.category;
      if (data.active !== undefined) video.active = data.active;
      await video.save();
      return video;
    } else {
      const video = new TutorialVideo({
        title: data.title,
        description: data.description || null,
        videoUrl: data.videoUrl,
        category: data.category || 'ORGANIZER',
        active: data.active !== undefined ? data.active : true,
      });
      await video.save();
      return video;
    }
  }

  static async deleteVideo(id) {
    const video = await TutorialVideo.findOne({ id: Number(id) });
    if (!video) throw new NotFoundError('Tutorial video not found');
    await TutorialVideo.deleteOne({ id: Number(id) });
  }
}

export default HelpService;
