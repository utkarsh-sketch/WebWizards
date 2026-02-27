import mongoose from 'mongoose';

const sosSchema = new mongoose.Schema(
  {
    crisisType: {
      type: String,
      enum: ['medical', 'breakdown', 'gas_leak', 'other'],
      required: true,
    },
    description: { type: String, trim: true, default: '' },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
      address: { type: String, trim: true, default: '' },
    },
    radiusMeters: {
      type: Number,
      enum: [500, 1000, 2000],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'resolved', 'cancelled'],
      default: 'active',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    responders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    responderLocations: [
      {
        responder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        location: {
          type: {
            type: String,
            enum: ['Point'],
            default: 'Point',
          },
          coordinates: {
            type: [Number],
            required: true,
          },
        },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    anonymous: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sosSchema.index({ location: '2dsphere' });
sosSchema.index({ status: 1, createdAt: -1 });

export const SOS = mongoose.model('SOS', sosSchema);
