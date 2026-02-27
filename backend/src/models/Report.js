import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    sosId: { type: mongoose.Schema.Types.ObjectId, ref: 'SOS', required: true, index: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true },
    resolved: { type: Boolean, default: false },
    resolutionNote: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export const Report = mongoose.model('Report', reportSchema);
