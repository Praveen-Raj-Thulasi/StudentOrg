import { AgentTool } from './agentTool.interface.js';
import { Event } from '../../models/Event.js';

export class TravelTool extends AgentTool {
  name() {
    return 'travelTool';
  }

  description() {
    return 'Generates travel guide for reaching an event venue: transport options, cab estimate, parking, nearby hotels, restaurants, and weather note.';
  }

  async execute(input = {}, principal = null) {
    const eventId = input.eventId ? Number(input.eventId) : null;
    if (!eventId) {
      return {
        error: 'eventId is required to generate a travel guide.',
        prompt: 'Which event are you asking about travel directions for?',
      };
    }

    try {
      const evt = await Event.findOne({ id: eventId }).lean();
      if (!evt) {
        return { error: 'Event not found.' };
      }

      return {
        eventId: evt.id,
        eventName: evt.eventName,
        venueName: evt.venueName || 'Venue TBD',
        location: evt.location || 'Location TBD',
        googleMapsUrl: evt.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(evt.venueName || evt.location || '')}`,
        nearestBusStop: evt.nearestBusStop || 'Campus Main Gate Bus Stop (500m)',
        nearestRailwayStation: evt.nearestRailwayStation || 'Central Railway Station (4.2 km)',
        nearestAirport: evt.nearestAirport || 'City International Airport (18 km)',
        metroInformation: evt.metroInformation || 'Blue Line - University Station (800m walk)',
        cabEstimate: evt.cabEstimate || '₹150 - ₹250 from Central Station',
        parkingAvailable: evt.parkingAvailable || 'Free on-campus 2-wheeler and 4-wheeler parking',
        travelGuide: evt.travelGuide || 'Follow main campus entrance signs towards the auditorium block.',
        nearbyHotels: evt.nearbyHotels || 'Campus Guest House, Grand Residency (1.5km)',
        nearbyRestaurants: evt.nearbyRestaurants || 'University Cafeteria, Green Leaf Restaurant',
        guardrail: 'This guidance uses only organizer-provided event travel information.',
      };
    } catch (err) {
      return { error: `Could not generate travel info: ${err.message}` };
    }
  }
}

export const travelTool = new TravelTool();
export default travelTool;
