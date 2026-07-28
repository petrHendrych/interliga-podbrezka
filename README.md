# Overview

This is an internal project for an Interliga ninepin team – Podbrezova. The purpose of the project is to create a web application for managing and tracking the 
results of ninepin bowling games and mainly faults money gathering accounting.

> Tool is made only for internal use of the team. The results may vary.

## Description

Project is deployed on Vercel with URL: https://interliga-podbrezka.vercel.app/. 

**Each player can watch there his annual results and faults money gathering fines for the accounting. Money is gathered by the following rules:**
- score under 600 -> 1€
- last from the team -> 1€
- fault into playing full -> 5€ (marked manually default to 0)
- each fault costs the same amount as the numeric order of the fault -> 1 fault = 1€, 2 faults = 1€ + 2€ = 3€,...
- missing 2nd to last throw -> 5€ (marked manually default to 0)
- 5 straight games without fault -> 10€

**There are also some special cases for trainer:**
- team plays over 3800 total -> 10€
- team plays over 3900 total -> 15€
- team plays without fault -> 10€

**We have a single bonus also:**
- play over 700 -> 30€ from bank + 10€ from trainer

## Design

- **Mobile-First Focus**: The main and first focus of the design should be mobile view. All components and layouts must be optimized for mobile devices before considering larger screens.

## Implementation detail

Data are web scraped from the official website of the Slovakian result system https://vysledky.kolky.sk/. Details about if the fault is 2nd to last throw is managed manually.

## Manual Setup

### Adding a Trainer
Trainers are not scraped from external data and must be added manually to the database. Use the following SQL query:

```sql
INSERT INTO users (name, role, is_approved) 
VALUES ('John Doe', 'trainer', true);
```
*(Email and password are not required as trainers don't log in).*
