-- Stage 4B initial storefront catalogue. Safe to rerun.
-- 'draft' means publicly visible as Coming soon, not purchasable.
-- Preserve audited Stage 4A product IDs, existing defaults and cross-category links.
-- Do not activate a product as part of a catalogue migration.
INSERT OR IGNORE INTO products(id,slug,name,description,status,sort_order) VALUES
('ticket-reveal','ticket-reveal','Ticket & Concert Reveal','Turn tickets, shows and special events into a memorable surprise.','draft',1),
('gift-reveal','gift-reveal','Gift Reveal','Unwrap an exciting personal gift digitally.','draft',2),
('surprise-experience','surprise-experience','Surprise Experience','Give an unforgettable experience in a special way.','draft',3),
('gift-voucher-reveal','gift-voucher-reveal','Gift Voucher Reveal','A more personal way to present a gift voucher.','draft',4),
('surprise-trip','surprise-trip','Surprise Trip','Build the excitement before revealing the destination.','draft',5),
('weekend-break','weekend-break','Weekend Break','Reveal a getaway with an interactive journey.','draft',6),
('holiday-reveal','holiday-reveal','Holiday Reveal','The destination stays a secret until the big moment.','draft',7),
('pregnancy-announcement','pregnancy-announcement','Pregnancy Announcement','Share your wonderful news with loved ones.','draft',8),
('gender-reveal','gender-reveal','Gender Reveal','Create a magical moment for your announcement.','draft',9),
('new-baby-announcement','new-baby-announcement','New Baby Announcement','Welcome a new arrival with a beautiful reveal.','draft',10),
('romantic-proposal','romantic-proposal','Romantic & Proposal Reveal','Make a meaningful personal surprise unforgettable.','draft',11),
('anniversary-reveal','anniversary-reveal','Anniversary Reveal','Celebrate your story with a heartfelt surprise.','draft',12),
('birthday-reveal','birthday-reveal','Birthday Reveal','Make a birthday surprise feel like an occasion.','draft',13),
('milestone-birthday','milestone-birthday','Milestone Birthday Reveal','Mark a milestone with a memorable reveal.','draft',14),
('engagement-reveal','engagement-reveal','Engagement Reveal','Announce your engagement in style.','draft',15),
('newlywed-gift','newlywed-gift','Newlywed Gift Reveal','Give a special surprise to a newly married couple.','draft',16),
('honeymoon-reveal','honeymoon-reveal','Honeymoon Reveal','Share the exciting honeymoon destination.','draft',17),
('new-home-announcement','new-home-announcement','New Home Announcement','Share the big move in a new way.','draft',18),
('new-job-announcement','new-job-announcement','New Job Announcement','Celebrate a new beginning.','draft',19),
('new-pet-announcement','new-pet-announcement','New Pet Announcement','Introduce your newest family member.','draft',20),
('bridesmaid-request','bridesmaid-request','Bridesmaid Request','Ask the special people in your life.','draft',21),
('godparent-request','godparent-request','Godparent Request','Make your invitation a moment to remember.','draft',22),
('exam-results','exam-results','Exam Results Reveal','Build suspense and celebrate achievement.','draft',23),
('graduation-reveal','graduation-reveal','Graduation Reveal','Share an achievement beautifully.','draft',24),
('christmas-surprise','christmas-surprise','Christmas Surprise','A digital surprise wrapped in Christmas magic.','draft',25),
('valentines-reveal','valentines-reveal','Valentine’s Reveal','A romantic surprise for someone special.','draft',26),
('easter-surprise','easter-surprise','Easter Surprise','An interactive seasonal surprise.','draft',27),
('custom-reveal','custom-reveal','Custom Reveal','Create your own unique reveal story.','draft',28),
('three-question-quiz','three-question-quiz','Three-Question Quiz','Answer three personalised questions to unlock the surprise.','draft',29),
('reveal-quest','reveal-quest','Reveal Quest','Solve sequential themed clues to unlock a final reveal.','draft',30);
INSERT OR IGNORE INTO category_products(category_id,product_id,sort_order) VALUES
('gifts-surprises','ticket-reveal',1),('gifts-surprises','gift-reveal',2),('gifts-surprises','surprise-experience',3),('gifts-surprises','gift-voucher-reveal',4),('gifts-surprises','three-question-quiz',5),('gifts-surprises','reveal-quest',6),
('trips-travel','surprise-trip',1),('trips-travel','weekend-break',2),('trips-travel','holiday-reveal',3),
('baby-family','pregnancy-announcement',1),('baby-family','gender-reveal',2),('baby-family','new-baby-announcement',3),
('love-relationships','romantic-proposal',1),('love-relationships','anniversary-reveal',2),
('birthdays-celebrations','birthday-reveal',1),('birthdays-celebrations','milestone-birthday',2),
('weddings-newlyweds','engagement-reveal',1),('weddings-newlyweds','newlywed-gift',2),('weddings-newlyweds','honeymoon-reveal',3),
('big-life-news','new-home-announcement',1),('big-life-news','new-job-announcement',2),('big-life-news','new-pet-announcement',3),
('invitations-asks','bridesmaid-request',1),('invitations-asks','godparent-request',2),
('results-achievements','exam-results',1),('results-achievements','graduation-reveal',2),
('seasonal','christmas-surprise',1),('seasonal','valentines-reveal',2),('seasonal','easter-surprise',3),
('custom-reveal','custom-reveal',1),('custom-reveal','reveal-quest',2),('custom-reveal','three-question-quiz',3);
INSERT OR IGNORE INTO product_mechanics(product_id,mechanic_id,is_default) VALUES
('ticket-reveal','cinematic',1),('gift-reveal','gift-box',1),('surprise-experience','gift-box',1),('gift-voucher-reveal','envelope',1),
('surprise-trip','journey',1),('weekend-break','journey',1),('holiday-reveal','journey',1),
('pregnancy-announcement','envelope',1),('gender-reveal','gift-box',1),('new-baby-announcement','envelope',1),
('romantic-proposal','envelope',1),('anniversary-reveal','envelope',1),
('birthday-reveal','gift-box',1),('milestone-birthday','gift-box',1),
('engagement-reveal','cinematic',1),('newlywed-gift','gift-box',1),('honeymoon-reveal','journey',1),
('new-home-announcement','envelope',1),('new-job-announcement','cinematic',1),('new-pet-announcement','gift-box',1),
('bridesmaid-request','envelope',1),('godparent-request','envelope',1),
('exam-results','scratch',1),('graduation-reveal','cinematic',1),
('christmas-surprise','gift-box',1),('valentines-reveal','envelope',1),('easter-surprise','gift-box',1),
('custom-reveal','envelope',1),('three-question-quiz','mystery-clues',1),('reveal-quest','mystery-clues',1);
INSERT OR IGNORE INTO product_themes(product_id,theme_id,is_default) VALUES
('ticket-reveal','classic-gold',1),('gift-reveal','classic-gold',1),('surprise-experience','celebration',1),('gift-voucher-reveal','classic-gold',1),
('surprise-trip','travel-adventure',1),('weekend-break','travel-adventure',1),('holiday-reveal','travel-adventure',1),
('pregnancy-announcement','baby',1),('gender-reveal','baby',1),('new-baby-announcement','baby',1),
('romantic-proposal','romantic',1),('anniversary-reveal','romantic',1),
('birthday-reveal','birthday-celebration',1),('milestone-birthday','birthday-celebration',1),
('engagement-reveal','elegant-wedding',1),('newlywed-gift','elegant-wedding',1),('honeymoon-reveal','travel-adventure',1),
('new-home-announcement','celebration',1),('new-job-announcement','celebration',1),('new-pet-announcement','celebration',1),
('bridesmaid-request','elegant-wedding',1),('godparent-request','celebration',1),
('exam-results','celebration',1),('graduation-reveal','celebration',1),
('christmas-surprise','christmas',1),('valentines-reveal','romantic',1),('easter-surprise','celebration',1),
('custom-reveal','custom',1),('three-question-quiz','celebration',1),('reveal-quest','travel-adventure',1);
-- Explicitly configured base price for existing ticket product ONLY.
-- Stripe is responsible for actual tax and international presentment at checkout.
INSERT OR IGNORE INTO product_prices(id,product_id,currency,country_code,amount_minor,tax_behavior,active)
VALUES ('ticket-reveal-gbp','ticket-reveal','gbp',NULL,199,'exclusive',1);
