import mongoose from "mongoose";

const goodsRecievedNoteSchema = new mongoose.Schema({});

const GoodsRecievedNote = mongoose.model(
  "GoodsRecievedNote",
  goodsRecievedNoteSchema
);

export default GoodsRecievedNote;
