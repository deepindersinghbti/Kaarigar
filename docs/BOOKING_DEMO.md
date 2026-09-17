# Booking commitments: demo script

Two people, two devices, on the deployed app: **Neha** (customer) and
**Ramesh** (kaarigar). Part A walks the full booking. Part B shows what happens
when a kaarigar is late or never comes, in about five minutes.

This extends `CUSTOMER_DEMO.md`, which covers browsing, quoting, counter-offers
and the completion answer. Everything there still works the same way; this adds
the time commitment on top.

## Before you start

### Accounts

- Use two **separate browser profiles** or two devices. Two tabs in one
  browser share a session and are not two people.
- **Ramesh:** "I am a Kaarigar", phone `9876543210`, then `DEMO_OTP_CODE`.
- **Neha:** "I need a Kaarigar", ID `0123456789`, then `DEMO_CUSTOMER_OTP_CODE`.

### Render environment

Set these in Render → **kaarigar** → **Environment**. None is a `VITE_`
variable, so saving and letting the service restart is enough; no rebuild.

| Key | Part A | Part B (LATE demo) |
|---|---|---|
| `BOOKINGS_ENABLED` | `true` | `true` |
| `CHECKIN_OTP_SECRET` | a 64-character secret | same |
| `DEMO_OTP_ENABLED`, `DEMO_OTP_CODE`, `DEMO_CUSTOMER_OTP_CODE` | as in `CUSTOMER_DEMO.md` | same |
| `BOOKING_DEMO_SLOTS` | leave unset | `true` |
| `ARRIVAL_GRACE_MIN` | leave unset (60) | `1` |
| `NO_SHOW_AFTER_MIN` | leave unset (1440) | `2` |

Check `https://kaarigar.onrender.com/api/health` before going on stage. It
should show `"bookingsEnabled":true`, and `"bookingDemoSlots":true` for Part B.

**Warm the service first.** A cold Render instance takes ~50 seconds to answer.
Open the app on both devices a minute before starting.

**Keep "Live" off and use Refresh.** A change that appears right after a tap is
clearly caused by that tap. Turn Live on at the end if you want to show updates
arriving by themselves.

---

## Part A: a booking kept (about 6 minutes)

The point to land: **accepting a job now means committing to a time, and
arriving is proven, not claimed.**

1. **Neha requests.** Directory → pick her area → **Ramesh** → describe the
   work, tick **I need someone urgently**, send. Under **My requests** she sees
   *"The kaarigar has until 3:45 pm to reply."*
   > Say: an urgent request gives the kaarigar 30 minutes to answer, a normal
   > one 4 hours. The clock is on the server, not the phone.

2. **Ramesh replies.** **Jobs** → **Refresh**. The new card shows
   *"Reply within 29m"*, a price box and **Decline**. He sends a price.
   > Say: declining costs him nothing. Silence does: an unanswered request
   > expires and counts against his response rate.

3. **Neha agrees the price.** **Refresh** → **Accept this price**. She now sees
   *"Waiting for the kaarigar to pick a time, by …"*.
   > Say: nothing was timed while she was deciding. Only now, with the price
   > agreed, does the kaarigar have 24 hours to name a time.

4. **Ramesh commits to a time.** **Refresh** → **Pick a time** replaces the old
   one-tap "Schedule job". Tomorrow → **Morning 9am – 11am** → **Confirm this
   time**. His card shows the agreed time and a countdown to arrival.
   > Point at his screen: **there is no arrival code on it anywhere.**

5. **Neha sees the code.** **Refresh** → the visit time and a large **4-digit
   arrival code**, with *"Give this code to the kaarigar only when they are at
   your door."*

6. **Ramesh arrives.** **I have arrived – enter code** replaces "Start work".
   - First type a **wrong** code: *"That code is not right…"*. The box stays
     open, and he stays signed in.
   - Then Neha reads out the real code, and he enters it. The card shows
     **You arrived**.
   > Say: the code only exists on the customer's phone, so entering it proves he
   > was standing with her. It is stored only as a keyed hash; the kaarigar's
   > app never receives it.

7. **The work ends as before.** Ramesh → **Mark work completed**. Neha →
   **Yes, it is done**. Ramesh can send the review link, and Neha rates the job.

8. **The record.** Ramesh → **Passport**. Under the trust score, **Reliability**
   shows *On time 1*. Open `/p/<his-handle>`, the page the QR code opens, and
   show the same numbers there.
   > Say: a worker with no bookings shows "no visits yet", not a percentage.
   > New workers start neutral, not penalised.

---

## Part B: a booking broken (about 5 minutes)

Needs the Part B environment above. **Put it back afterwards**: with
`ARRIVAL_GRACE_MIN=1`, every real booking would go late a minute after its slot.

1. **Set up a job to the agreed-price step** as in Part A, steps 1–3.

2. **Ramesh commits to a demo slot.** **Pick a time** → **Demo: in 2 minutes**
   → **Confirm this time**. The slot starts two minutes from now and lasts one
   minute; with a 1-minute grace, he must arrive within about **4 minutes**.
   > Say plainly: "we have shortened the clock for the demo. The rules are the
   > real ones."

3. **Let the deadline pass.** Talk through the passport and the rules for about
   four minutes, then **Refresh** on both devices.
   - **Neha:** a red *"The kaarigar is late"* banner. The arrival code is still
     shown, because a late kaarigar can still come.
   - **Ramesh:** a red *"You are late. Reach the customer and enter their code."*
     banner, and the arrival button is still there.
   > Say: nobody pressed anything. The deadline passed, and the next read
   > applied it.

4. **Choose one ending:**

   **a. He turns up late.** Neha reads out the code and Ramesh enters it. The
   job continues normally, but his passport shows **Late 1** and no on-time
   credit. Arriving late is recorded as late.

   **b. She gives up.** Neha → **Cancel – the kaarigar did not come** → confirm.
   The request shows *"The kaarigar did not arrive…"* with **Request another
   kaarigar**, which opens the directory. His passport now shows **Did not
   arrive 1**, and reliability drops.
   > Say: before this change, a customer could not cancel once a time was agreed,
   > because the kaarigar had committed his day. Once he has broken that
   > commitment, the protection no longer applies. She is never penalised; he
   > is.

   **c. Nobody does anything.** Wait `NO_SHOW_AFTER_MIN` (2 minutes) past the
   deadline and **Refresh**. It becomes a no-show by itself, exactly as in (b).
   To show it happens even when nobody opens the app, trigger the sweeper by
   hand instead of refreshing (see `docs/SWEEPER.md`):
   ```bash
   curl -X POST https://kaarigar.onrender.com/api/internal/sweep -H "x-sweep-secret: $SWEEP_SECRET"
   ```

5. **Show the passport.** Compare with Part A: a no-show today visibly lowers
   the reliability number and the trust score. Then point out that it is not
   permanent: older events fade, halving in weight every 45 days.

6. **Restore the environment**: unset `BOOKING_DEMO_SLOTS`, `ARRIVAL_GRACE_MIN`
   and `NO_SHOW_AFTER_MIN`.

---

## Questions to be ready for

- **"What if the customer just isn't home?"** The arrival code protects the
  customer, not the kaarigar. A kaarigar who reaches a locked door has no way
  to prove he came, and nothing automatic can settle that without a human
  reviewer, which this project deliberately does not have. See
  `KAARIGAR_RELIABILITY_FEATURE.md` §9.7. Say so directly.
- **"Can the kaarigar reschedule?"** Once, with at least 12 hours' notice, and
  only if the customer accepts. A proposal she does not answer before the
  original time is treated as refused.
- **"Does the server stay awake to enforce deadlines?"** No, and it does not
  need to. Deadlines are stored on the booking, applied whenever anyone opens
  the app, and swept every 10 minutes by an external cron job for bookings
  nobody opens.

## Verifying before the demo

```bash
npx tsx scripts/test-customer-booking-ui.ts   # Neha's booking screens, in Edge
npx tsx scripts/test-booking-ui.ts            # Ramesh's booking screens, in Edge
npx tsx scripts/test-booking-routes.ts        # the same rules over HTTP
```

These use throwaway databases. They do not prove the Render environment is set;
check `/api/health` for that.
