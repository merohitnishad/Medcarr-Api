import * as users from "./schemas/usersSchema.js";
import * as util from "./schemas/utilsSchema.js";
import * as job from "./schemas/jobSchema.js";
import * as notifications from "./schemas/notificationSchema.js";
import * as jobApplication from "./schemas/jobApplicationSchema.js";
import * as conversations from "./schemas/messageSchema.js";
import * as reviews from "./schemas/reviewSchema.js";
import * as disputes from "./schemas/disputeSchema.js";

export const schema = {
  ...users,
  ...util,
  ...job,
  ...notifications,
  ...jobApplication,
  ...conversations,
  ...reviews,
  ...disputes,
};
