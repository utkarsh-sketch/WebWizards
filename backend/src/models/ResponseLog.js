import mongoose from 'mongoose';

const responseLogSchema = new mongoose.Schema(
  {
    sosId: { type: mongoose.Schema.Types.ObjectId, ref: 'SOS', required: true, index: true },
    responderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['joined', 'left', 'resolved', 'status_update'],
      required: true,
    },
    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export const ResponseLog = mongoose.model('ResponseLog', responseLogSchema);
